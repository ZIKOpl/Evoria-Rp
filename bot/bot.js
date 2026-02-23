// ============================================================
//  DISTRICT WL — BOT v5.0  (MongoDB)
//  Collections : admins | news | streamers | reminders | claims
// ============================================================

require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, SlashCommandBuilder, REST, Routes,
  PermissionsBitField, Events
} = require('discord.js');
const { MongoClient: MClient } = require('mongodb');
const http   = require('http');
const urlMod = require('url');
const path   = require('path');
const fs     = require('fs');

// ── ENV ───────────────────────────────────────────────────────────
const TOKEN        = process.env.BOT_TOKEN;
const CLIENT_ID    = process.env.CLIENT_ID;
const GUILD_ID     = process.env.GUILD_ID;
const OAUTH_SECRET = process.env.DISCORD_OAUTH_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI        || 'http://localhost:3000/auth/discord/callback';
const HTTP_PORT    = parseInt(process.env.HTTP_PORT          || '3000');
const SITE_URL     = process.env.SITE_URL || `http://localhost:${HTTP_PORT}`;
const FIVEM_IP     = process.env.FIVEM_IP || '';
const MONGO_URI    = process.env.MONGO_URI;
const DB_NAME      = process.env.MONGO_DB  || 'district';
const TOP_SERVEURS_TOKEN = process.env.TOP_SERVEURS_TOKEN || '';

const SITE_DIR    = path.resolve(__dirname, '..');
const PAGES_DIR   = path.join(SITE_DIR, 'pages');

// Variables d'env pour la config publique
const DISCORD_INVITE    = process.env.DISCORD_INVITE    || '';
const BOUTIQUE_URL      = process.env.BOUTIQUE_URL      || '';
const REGLEMENT_URL     = process.env.REGLEMENT_URL     || '';
const DISCORD_GUILD_ID  = process.env.DISCORD_GUILD_ID  || '';
const HERO_BACKGROUND   = process.env.HERO_BACKGROUND   || 'assets/fond.png';
const TWITCH_CLIENT_ID    = process.env.TWITCH_CLIENT_ID    || '';
const TWITCH_ACCESS_TOKEN_VAR = process.env.TWITCH_ACCESS_TOKEN || '';
const TWITCH_WEBHOOK_URL  = process.env.TWITCH_WEBHOOK_URL  || '';
// TWITCH_ACCESS_TOKEN défini plus haut comme TWITCH_ACCESS_TOKEN_VAR
const TOP_SERVEURS_URL  = process.env.TOP_SERVEURS_URL  || '';
const WL_CATEGORY_ID    = process.env.WL_CATEGORY_ID    || '';  // ID de la catégorie Discord "Whitelist"
const WL_STAFF_ROLE_ID  = process.env.WL_STAFF_ROLE_ID  || '';  // ID du rôle Staff
const WL_ROLE_ID        = process.env.WL_ROLE_ID         || '';  // Role Whiteliste (citoyen)
const CANDIDATE_ROLE_ID = process.env.CANDIDATE_ROLE_ID  || '';  // Role Candidat (soumission en attente)
const BL_ROLE_ID        = process.env.BL_ROLE_ID         || '';  // Role Blackliste

// Pages qui nécessitent d'être admin Discord pour y accéder
const PROTECTED_PAGES = ['admin.html', 'gestion.html', 'gestion_backup.html'];

// ── ROLE HELPER — attribution robuste avec logs ───────────────────
async function applyRoles(discordId, { add = [], remove = [] }, context = '') {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) { console.error(`[Roles][${context}] Guild introuvable — GUILD_ID=${GUILD_ID}`); return false; }
    const member = await guild.members.fetch({ user: discordId, force: true }).catch(e => {
      console.error(`[Roles][${context}] Impossible de fetch le membre ${discordId}: ${e.message}`);
      return null;
    });
    if (!member) { console.warn(`[Roles][${context}] Membre ${discordId} introuvable dans le serveur`); return false; }
    for (const roleId of remove) {
      if (!roleId) continue;
      await member.roles.remove(roleId).catch(e => console.error(`[Roles][${context}] remove ${roleId}: ${e.message}`));
    }
    for (const roleId of add) {
      if (!roleId) continue;
      await member.roles.add(roleId).catch(e => console.error(`[Roles][${context}] add ${roleId}: ${e.message}`));
    }
    console.log(`[Roles][${context}] OK — membre=${discordId} add=[${add.filter(Boolean).join(',')}] remove=[${remove.filter(Boolean).join(',')}]`);
    return true;
  } catch(e) {
    console.error(`[Roles][${context}] Exception: ${e.message}`);
    return false;
  }
}


// ── MONGODB ───────────────────────────────────────────────────────
let db;

async function connectDB() {
  if (!MONGO_URI) throw new Error('MONGO_URI manquant dans .env — ajoute ton URI MongoDB Atlas');
  const client = new MClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`✅ MongoDB connecte → base "${DB_NAME}"`);
  // Index
  await db.collection('admins').createIndex({ id: 1 }, { unique: true }).catch(() => {});
  await db.collection('reminders').createIndex({ discordId: 1 }, { unique: true }).catch(() => {});
  await db.collection('claims').createIndex({ discordId: 1, month: 1 }).catch(() => {});
  await db.collection('news').createIndex({ ts: -1 }).catch(() => {});
  await db.collection('settings').createIndex({ key: 1 }, { unique: true }).catch(() => {});
  await db.collection('whitelist').createIndex({ discordId: 1 }, { unique: true }).catch(() => {});
}

const col = name => db.collection(name);

function toJSON(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, _id: _id?.toString() };
}
function toJSONArr(arr) { return arr.map(toJSON); }

// ── CLIENT DISCORD ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: ['CHANNEL', 'MESSAGE']
});

// ── SLASH COMMANDS ────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('addadmin').setDescription('Ajoute un administrateur au site')
    .addStringOption(o => o.setName('discord_id').setDescription('ID Discord').setRequired(true))
    .addStringOption(o => o.setName('pseudo').setDescription('Pseudo Discord').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
  new SlashCommandBuilder()
    .setName('deleteadmin').setDescription('Supprime un administrateur du site')
    .addStringOption(o => o.setName('discord_id').setDescription('ID Discord').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
  new SlashCommandBuilder()
    .setName('listadmin').setDescription('Liste tous les administrateurs du site')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
  new SlashCommandBuilder()
    .setName('claimervote')
    .setDescription("Reclamer ta recompense de voteur")
    .addStringOption(o => o.setName('pseudo_fivem').setDescription('Ton pseudo exact sur FiveM').setRequired(true)),
  new SlashCommandBuilder()
    .setName('topvoteurs').setDescription('Affiche le top 3 des voteurs du mois')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
  new SlashCommandBuilder()
    .setName('addwhitelist')
    .setDescription('Valide la whitelist d\'un joueur')
    .addStringOption(o => o.setName('discord_id').setDescription('ID Discord du joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
  new SlashCommandBuilder()
    .setName('blwhitelist')
    .setDescription('Blackliste un joueur - retire son acces whitelist')
    .addStringOption(o => o.setName('discord_id').setDescription('ID Discord du joueur').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison de la blacklist').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Commandes enregistrees : /addadmin /deleteadmin /listadmin /claimervote /topvoteurs /addwhitelist /blwhitelist');
  } catch (err) { console.error('Erreur commandes:', err); }
}

const RED = 0xFF1A1A, GREEN = 0x22C55E;

client.once(Events.ClientReady, async () => {
  console.log(`Bot connecte : ${client.user.tag}`);
  client.user.setActivity('District WL', { type: 3 });
  await connectDB();
  await registerCommands();
  startServer();
  startVoteReminders();
  startTwitchMonitor();
});

// ── RAPPELS DE VOTE ─────────────────────────────────────────────
function buildVoteReminderEmbed() {
  return {
    color: 0xDC2626,
    title: "⭐ N'oublie pas de voter !",
    description: [
      '**District WL** a besoin de ton vote pour grimper dans le classement !',
      '',
      '🗳️ **Voter prend moins de 30 secondes** et aide enormement le serveur.',
      '',
      `> [Voter maintenant sur Top-Serveurs.net](${process.env.TOP_SERVEURS_URL || 'https://top-serveurs.net'})`,
      '',
      '*Tu peux te desinscrire de ces rappels sur la page Vote du site.*'
    ].join('\n'),
    thumbnail: { url: 'https://top-serveurs.net/images/logo.png' },
    footer: { text: 'District WL — Rappel automatique · Toutes les 2h' },
    timestamp: new Date().toISOString()
  };
}

function startVoteReminders() {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  setTimeout(async () => {
    await sendVoteReminders();
    setInterval(sendVoteReminders, TWO_HOURS);
  }, 30_000);
  console.log('Rappels de vote actifs (toutes les 2h)');
}

async function sendVoteReminders() {
  // Vérifier si l'envoi est activé (flag en DB)
  const setting = await col('settings').findOne({ key: 'reminders_enabled' });
  if (setting && setting.value === false) {
    console.log('[Rappels votes] Désactivé par l\'admin — aucun DM envoyé.');
    return;
  }
  const list = await col('reminders').find({}).toArray();
  if (!list.length) return;
  let sent = 0, errors = 0;
  for (const r of list) {
    try {
      // force:false = utilise le cache si dispo, évite une erreur 404 si inconnu
      const u = await client.users.fetch(r.discordId, { force: false }).catch(async () => {
        // Si pas dans le cache, essayer de le fetch via le serveur
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
          const member = await guild.members.fetch(r.discordId).catch(() => null);
          return member?.user || null;
        }
        return null;
      });
      if (!u) {
        errors++;
        console.warn(`[Rappels votes] Echec DM → ${r.discordId} : Utilisateur introuvable (pas dans le serveur ?)`);
        continue;
      }
      await u.send({ embeds: [buildVoteReminderEmbed()] });
      sent++;
    } catch(e) {
      errors++;
      console.warn(`[Rappels votes] Echec DM → ${r.discordId} : ${e.message}`);
    }
  }
  console.log(`[Rappels votes] ${sent} envoye(s), ${errors} echec(s) sur ${list.length} inscrits`);
}


// ── NOTIFICATIONS TWITCH ──────────────────────────────────────────
let twitchToken = TWITCH_ACCESS_TOKEN_VAR;

async function refreshTwitchToken() {
  if (!TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;
  try {
    const r = await fetch(`https://id.twitch.tv/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
      })
    });
    const d = await r.json();
    if (d.access_token) { twitchToken = d.access_token; return d.access_token; }
  } catch(e) { console.error('[Twitch] Erreur refresh token:', e.message); }
  return null;
}

async function getTwitchStreamInfo(loginName) {
  if (!TWITCH_CLIENT_ID || !twitchToken) return null;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(loginName)}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
      signal: AbortSignal.timeout(6000)
    });
    if (r.status === 401) {
      await refreshTwitchToken();
      return null;
    }
    const d = await r.json();
    return d.data?.[0] || null;
  } catch(e) { return null; }
}

async function getTwitchUser(loginName) {
  if (!TWITCH_CLIENT_ID || !twitchToken) return null;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(loginName)}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
      signal: AbortSignal.timeout(6000)
    });
    const d = await r.json();
    return d.data?.[0] || null;
  } catch(e) { return null; }
}

async function sendTwitchWebhook(streamer, streamData, userData) {
  if (!TWITCH_WEBHOOK_URL) return;
  const viewerCount = streamData.viewer_count || 0;
  const streamTitle = streamData.title || 'Live en cours';
  const avatarUrl   = userData?.profile_image_url || '';
  const channelUrl  = streamer.url || `https://twitch.tv/${streamData.user_login}`;
  const payload = {
    embeds: [{
      color: 0xFF1A1A,
      author: {
        name: `${streamData.user_name || streamer.name} est en live !`,
        icon_url: avatarUrl,
        url: channelUrl
      },
      title: streamTitle,
      url: channelUrl,
      thumbnail: { url: avatarUrl },
      image: {
        url: streamData.thumbnail_url
          ? streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`
          : ''
      },
      fields: [
        { name: '👥 Viewers', value: `**${viewerCount.toLocaleString('fr-FR')}**`, inline: true },
        { name: '🎮 Catégorie', value: streamData.game_name || 'FiveM', inline: true },
        { name: '🔴 Live', value: `[Regarder le stream](${channelUrl})`, inline: true }
      ],
      footer: {
        text: 'District WL · Notification streamer',
        icon_url: `${process.env.SITE_URL}/assets/logo.png`
      },
      timestamp: new Date().toISOString()
    }],
    content: `🔴 **${streamData.user_name || streamer.name}** vient de lancer son live sur Twitch !`
  };
  try {
    await fetch(TWITCH_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });
    console.log(`[Twitch] Webhook envoyé pour ${streamer.name}`);
  } catch(e) { console.error(`[Twitch] Erreur webhook pour ${streamer.name}:`, e.message); }
}

async function checkTwitchStreamers() {
  if (!TWITCH_CLIENT_ID || !twitchToken) return;
  try {
    const streamers = await col('streamers').find({ platform: 'Twitch' }).toArray();
    if (!streamers.length) return;
    for (const streamer of streamers) {
      if (!streamer.url) continue;
      // Extraire le login depuis l'URL twitch.tv/login
      const loginMatch = streamer.url.match(/twitch\.tv\/([\w]+)/i);
      if (!loginMatch) continue;
      const login = loginMatch[1].toLowerCase();
      const streamData = await getTwitchStreamInfo(login);
      const isLive = !!streamData;
      const wasLive = !!streamer.isLive;
      // Mettre à jour le statut en DB
      await col('streamers').updateOne(
        { id: streamer.id },
        { $set: { isLive, viewers: streamData?.viewer_count || 0, lastChecked: new Date() } }
      );
      // Envoyer webhook seulement quand le streamer PASSE de offline → online
      if (isLive && !wasLive && TWITCH_WEBHOOK_URL) {
        const userData = await getTwitchUser(login);
        // Mettre à jour l'avatar si disponible
        if (userData?.profile_image_url && userData.profile_image_url !== streamer.avatar) {
          await col('streamers').updateOne({ id: streamer.id }, { $set: { avatar: userData.profile_image_url } });
        }
        await sendTwitchWebhook(streamer, streamData, userData);
      }
    }
  } catch(e) { console.error('[Twitch] Erreur check streamers:', e.message); }
}

function startTwitchMonitor() {
  if (!TWITCH_CLIENT_ID) {
    console.log('[Twitch] Monitor désactivé — TWITCH_CLIENT_ID non configuré');
    return;
  }
  // Refresh token au démarrage si on a le client_secret
  if (process.env.TWITCH_CLIENT_SECRET) refreshTwitchToken();
  // Check toutes les 3 minutes
  const THREE_MIN = 3 * 60 * 1000;
  setTimeout(async () => {
    await checkTwitchStreamers();
    setInterval(checkTwitchStreamers, THREE_MIN);
  }, 15_000); // délai initial de 15s
  console.log('[Twitch] Monitor activé — check toutes les 3 minutes');
}

// ── INTERACTIONS ──────────────────────────────────────────────────

// ── HELPER : deferReply sécurisé (ignore interaction expirée) ─────
async function safeDefer(interaction, opts = { ephemeral: true }) {
  try {
    await interaction.deferReply(opts);
    return true;
  } catch (e) {
    if (e?.code === 10062) {
      console.warn('[Interaction] Expirée avant deferReply, ignorée.');
      return false;
    }
    throw e;
  }
}

client.on(Events.InteractionCreate, async interaction => {
  // ─ Bouton fermer ticket ─
  if (interaction.isButton() && interaction.customId.startsWith('close_ticket:')) {
    const discordId = interaction.customId.split(':')[1];
    // Acquitter immédiatement l'interaction sans message éphémère (évite le "réfléchit")
    await interaction.deferUpdate().catch(() => {});
    // Message visible dans le ticket
    await interaction.channel.send({ embeds: [{
      color: 0xFF1A1A,
      title: '🔒 Fermeture du ticket',
      description: 'Ce ticket sera **supprimé dans 5 secondes**.',
      timestamp: new Date().toISOString()
    }]}).catch(() => {});
    // Marquer fermé en DB
    await col('whitelist').updateOne({ discordId }, { $set: { ticketClosed: true } });
    ticketChannelCache.delete(discordId);
    // DM au candidat
    try {
      const candidate = await client.users.fetch(discordId);
      await candidate.send({ embeds: [{
        color: 0xFF1A1A,
        title: 'Ticket fermé',
        description: 'Ton ticket de candidature whitelist a été **fermé** par les Douaniers.\n\nSi tu as des questions, rejoins notre Discord.',
        footer: { text: 'District WL' },
        timestamp: new Date().toISOString()
      }]});
    } catch {}
    // Supprimer le canal après 5s
    setTimeout(() => interaction.channel.delete().catch(console.error), 5000);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'addadmin') {
    const id = interaction.options.getString('discord_id').trim();
    const pseudo = interaction.options.getString('pseudo').trim();
    try {
      await col('admins').insertOne({ id, pseudo, addedAt: new Date() });
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Admin ajoute').setColor(GREEN)
          .addFields({ name: 'Discord ID', value: id, inline: true }, { name: 'Pseudo', value: pseudo, inline: true })
          .setFooter({ text: 'District WL — Panel Admin' }).setTimestamp()], ephemeral: true
      });
    } catch (e) {
      if (e.code === 11000) return interaction.reply({ content: `${pseudo} (${id}) est deja admin.`, ephemeral: true });
      throw e;
    }
  }

  if (interaction.commandName === 'deleteadmin') {
    const id  = interaction.options.getString('discord_id').trim();
    const doc = await col('admins').findOneAndDelete({ id });
    if (!doc) return interaction.reply({ content: `Aucun admin avec l'ID ${id}.`, ephemeral: true });
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle('Admin supprime').setColor(RED)
        .setDescription(`**${doc.pseudo}** (${doc.id}) a ete retire.`).setTimestamp()], ephemeral: true
    });
  }

  if (interaction.commandName === 'listadmin') {
    const admins = await col('admins').find({}).toArray();
    if (!admins.length) return interaction.reply({ content: 'Aucun administrateur enregistre.', ephemeral: true });
    const PAGE = 10, pages = Math.ceil(admins.length / PAGE);
    await interaction.reply({
      embeds: [buildListEmbed(admins, 0, PAGE)],
      components: pages > 1 ? [buildListNav(0, pages)] : [],
      ephemeral: true
    });
  }

  if (interaction.commandName === 'claimervote') {
    const pseudoFiveM = interaction.options.getString('pseudo_fivem').trim();
    const discordId   = interaction.user.id;
    const monthKey    = new Date().toISOString().slice(0, 7);
    const existing    = await col('claims').findOne({ discordId, month: monthKey, verified: true });
    if (existing) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(RED).setTitle('Deja verifie !')
          .setDescription(`Tu es deja verifie comme **${existing.pseudoFiveM}** pour ce mois-ci.`)
          .setFooter({ text: 'District WL' })], ephemeral: true
      });
    }
    if (!await safeDefer(interaction, { ephemeral: true })) return;
    let rankData = null;
    try {
      if (TOP_SERVEURS_TOKEN) {
        const r = await fetch(`https://api.top-serveurs.net/v1/servers/${TOP_SERVEURS_TOKEN}/players-ranking?type=current`, { signal: AbortSignal.timeout(8000) });
        rankData = await r.json();
      }
    } catch {}
    const players     = rankData?.players || [];
    const playerEntry = players.find(p => (p.playername || p.username || '').toLowerCase() === pseudoFiveM.toLowerCase());
    if (!playerEntry) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(RED).setTitle('Pseudo introuvable')
          .setDescription([
            `Le pseudo **${pseudoFiveM}** n'apparait pas dans le classement ce mois-ci.`,
            '', '**Verifie bien :**',
            '• Que tu as vote au moins une fois ce mois-ci',
            '• Que le pseudo est exactement le meme que sur Top-Serveurs.net',
            '', `> [Voir le classement](${SITE_URL}/pages/votes.html)`
          ].join('\n')).setFooter({ text: 'District WL' })]
      });
    }
    const rank = players.indexOf(playerEntry) + 1;
    await col('claims').updateOne(
      { discordId, month: monthKey },
      { $set: { discordId, discordTag: interaction.user.tag, pseudoFiveM, votes: playerEntry.votes || 0, rank, month: monthKey, verifiedAt: new Date(), verified: true } },
      { upsert: true }
    );
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(RED).setTitle('Identite verifiee !')
        .setDescription([
          `Tu es bien **${pseudoFiveM}** sur FiveM !`,
          '',
          `${medal} Tu es **${rank === 1 ? '1er' : rank + 'eme'}** avec **${playerEntry.votes} vote(s)**.`,
          '',
          rank <= 3 ? 'Tu fais partie du **Top 3** ! Recompenses en fin de mois.' : 'Continue a voter pour grimper !'
        ].join('\n')).setFooter({ text: 'District WL' }).setTimestamp()]
    });
  }

  if (interaction.commandName === 'addwhitelist') {
    await handleWhitelistCommand(interaction);
    return;
  }

  if (interaction.commandName === 'blwhitelist') {
    await handleBlWhitelistCommand(interaction);
    return;
  }

    if (interaction.commandName === 'topvoteurs') {
    if (!await safeDefer(interaction, { ephemeral: true })) return;
    let rankData = null;
    try {
      if (TOP_SERVEURS_TOKEN) {
        const r = await fetch(`https://api.top-serveurs.net/v1/servers/${TOP_SERVEURS_TOKEN}/players-ranking?type=current`, { signal: AbortSignal.timeout(8000) });
        rankData = await r.json();
      }
    } catch {}
    const players  = (rankData?.players || []).slice(0, 3);
    const monthKey = new Date().toISOString().slice(0, 7);
    const verified = await col('claims').find({ month: monthKey, verified: true }).toArray();
    const medals   = ['🥇', '🥈', '🥉'];
    const lines    = players.map((p, i) => {
      const pseudo     = p.playername || p.username || '?';
      const claim      = verified.find(c => c.pseudoFiveM.toLowerCase() === pseudo.toLowerCase());
      const discordStr = claim ? `<@${claim.discordId}>` : '⚠️ *Non lie — doit utiliser /claimervote*';
      return `${medals[i]} **${pseudo}** — ${p.votes} votes\n↳ Discord : ${discordStr}`;
    });
    const nonLies = players.filter(p => !verified.find(c => c.pseudoFiveM.toLowerCase() === (p.playername || p.username || '').toLowerCase())).length;
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(RED).setTitle('Top Voteurs du mois')
        .setDescription(lines.join('\n\n') || 'Aucun vote ce mois-ci.')
        .addFields({ name: 'Joueurs non lies', value: `${nonLies} joueur(s) du Top 3 n'ont pas utilise /claimervote`, inline: false })
        .setFooter({ text: `District WL · ${monthKey}` }).setTimestamp()]
    });
  }
});

function buildListEmbed(admins, page, pageSize) {
  const start = page * pageSize, slice = admins.slice(start, start + pageSize);
  return new EmbedBuilder().setTitle('Administrateurs — District WL').setColor(RED)
    .setDescription(slice.map((a, i) => `**${start+i+1}.** ${a.pseudo} — \`${a.id}\``).join('\n'))
    .setFooter({ text: `Page ${page+1}/${Math.ceil(admins.length/pageSize)} · ${admins.length} admin(s)` }).setTimestamp();
}
function buildListNav(page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`admin_page:${page-1}`).setLabel('Prec.').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`admin_page:${page+1}`).setLabel('Suiv.').setStyle(ButtonStyle.Secondary).setDisabled(page >= total-1)
  );
}


// ── RELAY TICKETS ─────────────────────────────────────────────────
// Map discordId → channelId (cache mémoire pour perf)
const ticketChannelCache = new Map();

async function getTicketChannel(discordId) {
  if (ticketChannelCache.has(discordId)) {
    const cached = ticketChannelCache.get(discordId);
    const ch = client.channels.cache.get(cached);
    if (ch) return ch;
    ticketChannelCache.delete(discordId);
  }
  const entry = await col('whitelist').findOne({ discordId, submitted: true });
  if (!entry || !entry.ticketChannelId) return null;
  try {
    const ch = await client.channels.fetch(entry.ticketChannelId);
    if (ch) ticketChannelCache.set(discordId, ch.id);
    return ch;
  } catch { return null; }
}

function buildCandidatureEmbed(body) {
  return {
    color: 0xFF1A1A,
    author: {
      name: `Candidature Whitelist — ${body.discordPseudo}`,
      icon_url: body.discordAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'
    },
    thumbnail: { url: body.discordAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png' },
    fields: [
      { name: 'Score QCM', value: `**${body.qcmScore} / 20**`, inline: true },
      { name: 'Discord', value: `<@${body.discordId}>`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Prénom IRL', value: body.prenom || '—', inline: true },
      { name: 'Âge IRL', value: `${body.age} ans`, inline: true },
      { name: 'Disponibilités', value: body.dispo || '—', inline: true },
      { name: 'Expérience RP', value: body.exp || '—', inline: true },
      { name: 'Pourquoi District WL ?', value: (body.pourquoi || '—').slice(0, 1024), inline: false },
      { name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
      { name: 'Personnage', value: `**${body.persoPrenom || ''} ${body.persoNom || ''}**, ${body.persoAge} ans — Origine : ${body.persoOrigine || '—'}`, inline: false },
      { name: 'Qualités', value: (body.qualites || '—').slice(0, 512), inline: true },
      { name: 'Défauts', value: (body.defauts || '—').slice(0, 512), inline: true },
      { name: 'Histoire du personnage', value: (body.histoire || '—').slice(0, 1024), inline: false },
      { name: 'Objectifs RP', value: (body.objectifs || '—').slice(0, 512), inline: false },
    ],
    footer: { text: `District WL · Candidature · Répondez dans ce salon — le candidat sera notifié en DM` },
    timestamp: new Date().toISOString()
  };
}

function buildDMConfirmEmbed(body) {
  return {
    color: 0xFF1A1A,
    title: 'Candidature bien reçue',
    description: [
      `Bonjour **${body.discordPseudo}**,`,
      '',
      "L'équipe des Douaniers de District WL a bien reçu ta candidature whitelist.",
      "Nous allons l'examiner et te répondre dans les plus brefs délais.",
      '',
      '**Récapitulatif de ta candidature :**'
    ].join('\n'),
    fields: [
      { name: 'Score QCM', value: `${body.qcmScore} / 20`, inline: true },
      { name: 'Personnage', value: `${body.persoPrenom || ''} ${body.persoNom || ''}`, inline: true },
      { name: 'Âge du personnage', value: `${body.persoAge} ans`, inline: true },
      { name: 'Origine', value: body.persoOrigine || '—', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Pourquoi nous ?', value: (body.pourquoi || '—').slice(0, 512), inline: false },
      { name: 'Histoire du personnage', value: (body.histoire || '—').slice(0, 512) + (body.histoire?.length > 512 ? '...' : ''), inline: false },
    ],
    footer: { text: 'District WL · Pour répondre à nos messages, utilisez ce DM Bot' },
    timestamp: new Date().toISOString()
  };
}

function buildStaffMessageEmbed(staffName, staffAvatar, content, timestamp) {
  return {
    color: 0xFF1A1A,
    author: {
      name: `${staffName} — Douanier`,
      icon_url: staffAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'
    },
    description: content,
    footer: { text: 'District WL · Message du staff' },
    timestamp: timestamp || new Date().toISOString()
  };
}

function buildPlayerReplyEmbed(pseudo, avatar, content) {
  return {
    color: 0xFF1A1A,
    author: {
      name: `${pseudo} — Candidat`,
      icon_url: avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'
    },
    description: content,
    footer: { text: 'District WL · Réponse du candidat via DM' },
    timestamp: new Date().toISOString()
  };
}

// ── COMMANDE /whitelist ────────────────────────────────────────────
async function handleWhitelistCommand(interaction) {
  const discordId = interaction.options.getString('discord_id').trim();
  if (!await safeDefer(interaction, { ephemeral: true })) return;
  const entry = await col('whitelist').findOne({ discordId, submitted: true });
  if (!entry) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(RED).setTitle('Candidature introuvable').setDescription(`Aucune candidature soumise pour l'ID \`${discordId}\`.`).setTimestamp()] });
  }
  if (entry.whitelisted) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(AMBER).setTitle('Déjà whitelisté').setDescription(`<@${discordId}> est déjà whitelisté.`).setTimestamp()] });
  }
  // Marquer whitelisté
  await col('whitelist').updateOne({ discordId }, { $set: { whitelisted: true, whitelistedAt: new Date(), whitelistedBy: interaction.user.tag } });
  // Gestion des roles Discord : retirer Candidat/BL, ajouter Citoyen WL
  await applyRoles(discordId, { add: [WL_ROLE_ID], remove: [CANDIDATE_ROLE_ID, BL_ROLE_ID] }, 'slash/wl');
  // DM de confirmation au joueur
  try {
    const user = await client.users.fetch(discordId);
    await user.send({ embeds: [{
      color: 0xFF1A1A,
      title: 'Félicitations — Whitelist obtenue !',
      description: [
        `Bonjour **${entry.discordPseudo}**,`,
        '',
        'Après examen de ta candidature, les Douaniers de District WL t\'ont accordé ta **whitelist**.',
        '',
        'Tu peux désormais rejoindre le serveur et commencer ton aventure.',
        '',
        `> **Personnage :** ${entry.persoPrenom || ''} ${entry.persoNom || ''}`,
        `> **Score QCM :** ${entry.qcmScore} / 20`,
      ].join('\n'),
      footer: { text: 'District WL · Bonne aventure !' },
      timestamp: new Date().toISOString()
    }]});
  } catch(e) { console.error('[Whitelist DM]', e.message); }
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle('Joueur whitelisté').setDescription(`<@${discordId}> (${entry.discordPseudo}) a été whitelisté avec succès.\nUn DM de confirmation lui a été envoyé.`).setTimestamp()] });
}


// ── COMMANDE /blwhitelist ──────────────────────────────────────────
async function handleBlWhitelistCommand(interaction) {
  const discordId = interaction.options.getString('discord_id').trim();
  const raison    = interaction.options.getString('raison') || 'Aucune raison precisee';
  if (!await safeDefer(interaction, { ephemeral: true })) return;

  // Marquer BL en DB
  await col('whitelist').updateOne(
    { discordId },
    { $set: { blacklisted: true, blacklistedAt: new Date(), blacklistedBy: interaction.user.tag, blacklistReason: raison, whitelisted: false } },
    { upsert: true }
  );

  // Gerer les roles Discord
  await applyRoles(discordId, { add: [BL_ROLE_ID], remove: [WL_ROLE_ID, CANDIDATE_ROLE_ID] }, 'slash/bl');

  // DM au joueur
  try {
    const user = await client.users.fetch(discordId);
    await user.send({ embeds: [{
      color: 0xFF1A1A,
      title: 'Whitelist refusee',
      description: [
        'Ta candidature sur **District WL** a ete **refusee**.',
        '',
        '> **Raison :** ' + raison,
        '',
        "Si tu penses que c'est une erreur, ouvre un ticket sur notre serveur Discord.",
      ].join('\n'),
      footer: { text: 'District WL' },
      timestamp: new Date().toISOString()
    }]});
  } catch(e) { console.error('[BL DM]', e.message); }

  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(RED).setTitle('Joueur blackliste').setDescription('<@' + discordId + '> a ete blackliste.\n**Raison :** ' + raison).setTimestamp()] });
}

// ── MESSAGECREATE : Relay tickets ─────────────────────────────────
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // ─ DM reçu → retranscrire dans le ticket ─
  if (!message.guild && message.channel.type !== undefined) {
    const entry = await col('whitelist').findOne({ discordId: message.author.id, submitted: true });
    if (!entry || !entry.ticketChannelId) return;
    // Ne pas relayer après fermeture
    if (entry.ticketClosed) return;
    const ch = await getTicketChannel(message.author.id).catch(() => null);
    if (!ch) return;
    const embed = buildPlayerReplyEmbed(
      message.author.globalName || message.author.username,
      message.author.displayAvatarURL(),
      message.content || '*[message sans texte]*'
    );
    await ch.send({ embeds: [embed] }).catch(console.error);
    return;
  }

  // ─ Message dans un ticket → relayer en DM au candidat ─
  if (message.guild && message.channel.parentId === WL_CATEGORY_ID && message.channel.name.startsWith('wl-')) {
    const entry = await col('whitelist').findOne({ ticketChannelId: message.channel.id, submitted: true });
    if (!entry) return;
    if (entry.ticketClosed) return;
    // Ne pas relayer les messages du bot lui-même
    if (message.author.id === client.user.id) return;
    try {
      const candidate = await client.users.fetch(entry.discordId);
      const embed = buildStaffMessageEmbed(
        message.member?.displayName || message.author.globalName || message.author.username,
        message.author.displayAvatarURL(),
        message.content || '*[message sans texte]*',
        message.createdAt.toISOString()
      );
      await candidate.send({ embeds: [embed] });
    } catch(e) { /* DMs fermés */ }
  }
});

// ── MIME / HELPERS HTTP ───────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp',
  '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf',
};
function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

// ── SERVEUR HTTP ──────────────────────────────────────────────────
function startServer() {
  http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type' });
      return res.end();
    }
    const parsed   = urlMod.parse(req.url, true);
    const pathname = parsed.pathname;
    const method   = req.method;

    // OAuth callback
    if (pathname === '/auth/discord/callback') {
      const code  = parsed.query.code;
      // Le paramètre 'state' encode la page de retour (ex: 'votes' pour revenir sur votes.html)
      const state = parsed.query.state || '';
      const returnPage = state === 'votes' ? '/pages/votes.html' : state === 'whitelist' ? '/pages/whitelist.html' : '/';
      if (!code) { res.writeHead(302, { Location: `${SITE_URL}${returnPage}?auth_error=no_code` }); return res.end(); }
      try {
        const token = await (await fetch('https://discord.com/api/oauth2/token', {
          method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id:CLIENT_ID, client_secret:OAUTH_SECRET, grant_type:'authorization_code', code, redirect_uri:REDIRECT_URI })
        })).json();
        if (!token.access_token) throw new Error('No access_token');
        const u      = await (await fetch('https://discord.com/api/users/@me', { headers:{ Authorization:`Bearer ${token.access_token}` } })).json();
        const admin  = await col('admins').findOne({ id: u.id });
        const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${parseInt(u.discriminator||0)%5}.png`;
        const params = new URLSearchParams({ discord_id:u.id, discord_pseudo:u.username, discord_avatar:avatar, is_admin:admin?'1':'0', global_name:u.global_name||u.username });
        res.writeHead(302, { Location:`${SITE_URL}${returnPage}?${params}` }); res.end();
      } catch (err) { console.error('[OAuth]', err); res.writeHead(302, { Location:`${SITE_URL}${returnPage}?auth_error=failed` }); res.end(); }
      return;
    }

    // Auth check
    if (pathname === '/auth/check') {
      const admin = await col('admins').findOne({ id: parsed.query.id });
      return jsonRes(res, 200, { isAdmin:!!admin, pseudo:admin?.pseudo||null });
    }

    // Admins CRUD
    if (pathname === '/auth/admins') {
      if (method === 'GET') return jsonRes(res, 200, toJSONArr(await col('admins').find({}).toArray()));
      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.id || !body.pseudo) return jsonRes(res, 400, { error:'id et pseudo requis' });
        try { await col('admins').insertOne({ id:body.id, pseudo:body.pseudo, addedAt:new Date() }); return jsonRes(res, 201, { ok:true }); }
        catch(e) { if (e.code===11000) return jsonRes(res, 409, { error:'Admin deja existant' }); throw e; }
      }
      if (method === 'DELETE') {
        const id = parsed.query.id;
        if (!id) return jsonRes(res, 400, { error:'id requis' });
        await col('admins').deleteOne({ id });
        return jsonRes(res, 200, { ok:true });
      }
      return jsonRes(res, 405, { error:'Methode non supportee' });
    }

    // FiveM proxy
    if (pathname === '/api/fivem') {
      const ip = FIVEM_IP || parsed.query.ip;
      if (!ip) return jsonRes(res, 400, { error:'IP manquante' });
      try {
        const r = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${Buffer.from(ip).toString('base64')}`, { signal:AbortSignal.timeout(8000) });
        if (r.ok) { const d = (await r.json())?.Data; if (d) return jsonRes(res, 200, { online:true, players:d.clients??0, maxPlayers:d.sv_maxclients??128 }); }
      } catch {}
      try {
        const [host, port] = ip.split(':');
        const [r2, r3] = await Promise.all([fetch(`http://${host}:${port}/info.json`,{signal:AbortSignal.timeout(5000)}), fetch(`http://${host}:${port}/players.json`,{signal:AbortSignal.timeout(5000)})]);
        if (r2.ok) { const info=await r2.json(); return jsonRes(res,200,{online:true,players:r3.ok?(await r3.json()).length:0,maxPlayers:info?.vars?.sv_maxclients??128}); }
      } catch {}
      return jsonRes(res, 200, { online:false, players:0, maxPlayers:0 });
    }

    // News CRUD
    if (pathname === '/api/news') {
      if (method === 'GET') return jsonRes(res, 200, toJSONArr(await col('news').find({}).sort({ order:1, ts:-1 }).toArray()));
      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.title || !body.desc) return jsonRes(res, 400, { error:'title et desc requis' });
        const count = await col('news').countDocuments();
        const item  = { id:Date.now(), title:body.title, desc:body.desc, image:body.image||'', tag:body.tag||'Actualite', tagColor:body.tagColor||'#FF1A1A', ts:Date.now(), order:count, pinned:false, featured:false };
        await col('news').insertOne(item);
        return jsonRes(res, 201, toJSON(item));
      }
      if (method === 'PATCH') {
        const body = await readBody(req);
        if (Array.isArray(body.orders)) {
          await Promise.all(body.orders.map(({id,order}) => col('news').updateOne({id},{$set:{order}})));
          return jsonRes(res, 200, { ok:true });
        }
        const id = parseInt(body.id); if (!id) return jsonRes(res, 400, { error:'id requis' });
        const upd = {};
        ['pinned','featured','title','desc','image','tag','tagColor'].forEach(k => { if (body[k]!==undefined) upd[k]=body[k]; });
        const r = await col('news').updateOne({ id }, { $set:upd });
        if (r.matchedCount===0) return jsonRes(res, 404, { error:'non trouve' });
        return jsonRes(res, 200, { ok:true });
      }
      if (method === 'DELETE') {
        const id = parseInt(parsed.query.id); if (!id) return jsonRes(res, 400, { error:'id requis' });
        await col('news').deleteOne({ id });
        return jsonRes(res, 200, { ok:true });
      }
      return jsonRes(res, 405, { error:'Methode non supportee' });
    }

    // Streamers CRUD
    if (pathname === '/api/streamers') {
      if (method === 'GET') return jsonRes(res, 200, toJSONArr(await col('streamers').find({}).sort({ addedAt:1 }).toArray()));
      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.name || !body.url) return jsonRes(res, 400, { error:'name et url requis' });
        const item = { id:Date.now(), name:body.name, url:body.url, avatar:body.avatar||'', platform:'Twitch', isLive:false, addedAt:new Date() };
        await col('streamers').insertOne(item);
        return jsonRes(res, 201, toJSON(item));
      }
      if (method === 'DELETE') {
        const id = parseInt(parsed.query.id); if (!id) return jsonRes(res, 400, { error:'id requis' });
        await col('streamers').deleteOne({ id });
        return jsonRes(res, 200, { ok:true });
      }
      return jsonRes(res, 405, { error:'Methode non supportee' });
    }

    // Votes ranking proxy
    if (pathname === '/api/votes/ranking') {
      if (!TOP_SERVEURS_TOKEN) return jsonRes(res, 503, { error:'TOP_SERVEURS_TOKEN manquant' });
      const period = parsed.query.period==='lastMonth' ? 'lastMonth' : 'current';
      try {
        const r = await fetch(`https://api.top-serveurs.net/v1/servers/${TOP_SERVEURS_TOKEN}/players-ranking?type=${period}`, { signal:AbortSignal.timeout(8000) });
        return jsonRes(res, 200, await r.json());
      } catch { return jsonRes(res, 502, { error:'Impossible de joindre Top-Serveurs.net' }); }
    }

    // ── Vérifier si un user est inscrit aux rappels ────────────
    if (pathname.startsWith('/api/vote-reminders/status') && method === 'GET') {
      const discordId = parsed.query.discordId;
      if (!discordId) return jsonRes(res, 400, { error: 'discordId requis' });
      const existing = await col('reminders').findOne({ discordId });
      return jsonRes(res, 200, { subscribed: !!existing });
    }

    // ── Statut rappels (GET) ────────────────────────────────────
    if (pathname === '/api/reminders-status' && method === 'GET') {
      const setting = await col('settings').findOne({ key: 'reminders_enabled' });
      const enabled = setting ? setting.value !== false : true;
      return jsonRes(res, 200, { enabled });
    }

    // ── Forcer l'envoi immédiat des rappels (POST) ──────────────
    if (pathname === '/api/reminders-force' && method === 'POST') {
      try {
        const list = await col('reminders').find({}).toArray();
        if (!list.length) return jsonRes(res, 200, { ok: true, sent: 0, errors: 0, total: 0 });
        let sent = 0, errors = 0;
        const failedIds = [];
        for (const r of list) {
          try {
            const u = await client.users.fetch(r.discordId, { force: false }).catch(async () => {
              const guild = client.guilds.cache.get(GUILD_ID);
              if (guild) {
                const member = await guild.members.fetch(r.discordId).catch(() => null);
                return member?.user || null;
              }
              return null;
            });
            if (!u) {
              errors++;
              failedIds.push(r.discordId);
              console.warn(`[Force rappel] Echec DM → ${r.discordId} : Utilisateur introuvable`);
              continue;
            }
            await u.send({ embeds: [buildVoteReminderEmbed()] });
            sent++;
          } catch(e) {
            errors++;
            failedIds.push(r.discordId);
            console.warn(`[Force rappel] Echec DM → ${r.discordId} : ${e.message}`);
          }
        }
        console.log(`[Force rappel] ${sent} envoye(s), ${errors} echec(s) sur ${list.length}`);
        return jsonRes(res, 200, { ok: true, sent, errors, total: list.length, failedIds });
      } catch(e) {
        console.error('[Force rappel]', e);
        return jsonRes(res, 500, { error: e.message });
      }
    }

    // ── Envoyer un message custom à tous les inscrits (POST) ─────
    if (pathname === '/api/send-custom-message' && method === 'POST') {
      try {
        const body = await readBody(req);
        if (!body.message || !body.message.trim()) return jsonRes(res, 400, { error: 'message requis' });
        const list = await col('reminders').find({}).toArray();
        if (!list.length) return jsonRes(res, 200, { ok: true, sent: 0, errors: 0, total: 0 });
        let sent = 0, errors = 0;
        const failedIds = [];
        const embed = {
          color: 0xDC2626,
          description: body.message.trim(),
          footer: { text: 'District WL' },
          timestamp: new Date().toISOString()
        };
        if (body.title) embed.title = body.title.trim();
        for (const r of list) {
          try {
            const u = await client.users.fetch(r.discordId, { force: false }).catch(async () => {
              const guild = client.guilds.cache.get(GUILD_ID);
              if (guild) {
                const member = await guild.members.fetch(r.discordId).catch(() => null);
                return member?.user || null;
              }
              return null;
            });
            if (!u) {
              errors++;
              failedIds.push(r.discordId);
              console.warn(`[Message custom] Echec DM → ${r.discordId} : Utilisateur introuvable`);
              continue;
            }
            await u.send({ embeds: [embed] });
            sent++;
          } catch(e) {
            errors++;
            failedIds.push(r.discordId);
            console.warn(`[Message custom] Echec DM → ${r.discordId} : ${e.message}`);
          }
        }
        console.log(`[Message custom] "${body.title||'Sans titre'}" → ${sent} envoye(s), ${errors} echec(s)`);
        return jsonRes(res, 200, { ok: true, sent, errors, total: list.length, failedIds });
      } catch(e) {
        console.error('[Message custom]', e);
        return jsonRes(res, 500, { error: e.message });
      }
    }

    // ── Toggle rappels (POST) ────────────────────────────────────
    if (pathname === '/api/reminders-toggle' && method === 'POST') {
      const body = await readBody(req);
      const enabled = body.enabled !== false; // true par défaut
      await col('settings').updateOne(
        { key: 'reminders_enabled' },
        { $set: { key: 'reminders_enabled', value: enabled, updatedAt: new Date() } },
        { upsert: true }
      );
      console.log(`[Rappels votes] ${enabled ? 'Activé' : 'Désactivé'} par l'admin`);
      return jsonRes(res, 200, { ok: true, enabled });
    }

    // Vote reminders
    if (pathname === '/api/vote-reminders') {
      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.discordId) return jsonRes(res, 400, { error:'discordId requis' });
        const existing = await col('reminders').findOne({ discordId:body.discordId });
        if (existing) return jsonRes(res, 200, { already:true });
        await col('reminders').insertOne({ discordId:body.discordId, addedAt:new Date() });
        try {
          const u = await client.users.fetch(body.discordId);
          await u.send({ embeds:[{ color:0xDC2626, title:'Rappels de vote actives !', description:'Tu recevras un DM toutes les **2 heures** pour voter pour **District WL**.\n\nChaque vote aide le serveur a gagner en visibilite !', footer:{ text:'Pour te desinscrire, retourne sur la page Vote du site.' } }] });
        } catch {}
        return jsonRes(res, 201, { ok:true });
      }
      if (method === 'DELETE') {
        const discordId = parsed.query.discordId;
        if (!discordId) return jsonRes(res, 400, { error:'discordId requis' });
        const result  = await col('reminders').deleteOne({ discordId });
        const removed = result.deletedCount > 0;
        if (removed) {
          try {
            const u = await client.users.fetch(discordId);
            await u.send({ embeds:[{ color:0xDC2626, title:'Rappels desactives', description:`Tu ne recevras plus de DM automatique.\n\nPour te reinscrire : **${process.env.SITE_URL||'https://district-rp.fr'}/pages/votes.html**`, footer:{ text:'District WL' }, timestamp:new Date().toISOString() }] });
          } catch {}
        }
        return jsonRes(res, 200, { removed });
      }
      return jsonRes(res, 405, { error:'Methode non supportee' });
    }

    // ── CONFIG PUBLIQUE ──────────────────────────────────────────
    // Expose uniquement les infos non-sensibles au frontend

    // ── WHITELIST ─────────────────────────────────────────────────
    // GET /api/whitelist/status?discordId=xxx
    if (pathname === '/api/whitelist/status' && method === 'GET') {
      const discordId = parsed.query.discordId;
      if (!discordId) return jsonRes(res, 400, { error: 'discordId requis' });
      const entry = await col('whitelist').findOne({ discordId });
      if (!entry) return jsonRes(res, 200, { cooldown: false, submitted: false, whitelisted: false });
      if (entry.whitelisted) return jsonRes(res, 200, { whitelisted: true, submitted: true });
      if (entry.submitted) return jsonRes(res, 200, { submitted: true, whitelisted: false });
      if (entry.cooldownUntil && new Date(entry.cooldownUntil) > new Date()) {
        return jsonRes(res, 200, { cooldown: true, failedAt: entry.failedAt?.getTime?.() || Date.now() });
      }
      return jsonRes(res, 200, { cooldown: false, submitted: false, whitelisted: false });
    }

    // POST /api/whitelist/fail  { discordId, score }
    if (pathname === '/api/whitelist/fail' && method === 'POST') {
      const body = await readBody(req);
      if (!body.discordId) return jsonRes(res, 400, { error: 'discordId requis' });
      const cooldownUntil = new Date(Date.now() + 48 * 3600 * 1000);
      await col('whitelist').updateOne(
        { discordId: body.discordId },
        { $set: { discordId: body.discordId, score: body.score, failedAt: new Date(), cooldownUntil, submitted: false } },
        { upsert: true }
      );
      return jsonRes(res, 200, { ok: true });
    }

    // POST /api/whitelist/submit  { discordId, discordPseudo, discordAvatar, qcmScore, ...formData }
    if (pathname === '/api/whitelist/submit' && method === 'POST') {
      const body = await readBody(req);
      if (!body.discordId || !body.discordPseudo) return jsonRes(res, 400, { error: 'Données manquantes' });
      // Vérifier qu'il n'y a pas de doublon soumis
      const existing = await col('whitelist').findOne({ discordId: body.discordId, submitted: true });
      if (existing) return jsonRes(res, 409, { error: 'Candidature déjà soumise' });

      // Sauvegarder en DB
      await col('whitelist').updateOne(
        { discordId: body.discordId },
        { $set: { ...body, submitted: true, submittedAt: new Date(), cooldownUntil: null } },
        { upsert: true }
      );

      // Créer le ticket Discord et envoyer DM
      try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild && WL_CATEGORY_ID) {
          const channelName = `wl-${(body.discordPseudo || 'candidat').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0,20)}-${body.discordId.slice(-4)}`;
          // Le candidat n'a PAS accès au ticket (lecture seule côté candidat = pas d'accès)
          const channel = await guild.channels.create({
            name: channelName,
            type: 0,
            parent: WL_CATEGORY_ID,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
              // Pas de permission pour le candidat — communication via DM uniquement
              ...(WL_STAFF_ROLE_ID ? [{ id: WL_STAFF_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'] }] : [])
            ]
          });
          // Stocker le channelId en DB
          await col('whitelist').updateOne({ discordId: body.discordId }, { $set: { ticketChannelId: channel.id, ticketClosed: false } });
          ticketChannelCache.set(body.discordId, channel.id);

          // Bouton fermer le ticket
          const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`close_ticket:${body.discordId}`)
              .setLabel('Fermer le ticket')
              .setStyle(ButtonStyle.Danger)
          );

          // Embed principal de candidature
          await channel.send({
            content: WL_STAFF_ROLE_ID ? `<@&${WL_STAFF_ROLE_ID}> — Nouvelle candidature whitelist` : 'Nouvelle candidature whitelist',
            embeds: [buildCandidatureEmbed(body)],
            components: [closeRow]
          });
        }
        // DM de confirmation au candidat
        try {
          const candidateUser = await client.users.fetch(body.discordId);
          await candidateUser.send({ embeds: [buildDMConfirmEmbed(body)] });
        } catch(dmErr) { console.log('[Whitelist DM] Impossible d\'envoyer le DM:', dmErr.message); }
      } catch(discordErr) {
        console.error('[Whitelist] Erreur création ticket Discord:', discordErr.message);
      }

      // Attribuer le role Candidat si configure
      await applyRoles(body.discordId, { add: [CANDIDATE_ROLE_ID] }, 'api/submit/candidat');

      return jsonRes(res, 201, { ok: true });
    }


    // POST /api/whitelist/bl { discordId, raison } — Blacklister via site admin
    if (pathname === '/api/whitelist/bl' && method === 'POST') {
      const body = await readBody(req);
      if (!body.discordId) return jsonRes(res, 400, { error: 'discordId requis' });
      const raison = body.raison || 'Aucune raison precisee';
      const entry  = await col('whitelist').findOne({ discordId: body.discordId });
      await col('whitelist').updateOne(
        { discordId: body.discordId },
        { $set: { blacklisted: true, blacklistedAt: new Date(), blacklistedBy: 'admin-web', blacklistReason: raison, whitelisted: false } },
        { upsert: true }
      );
      // Roles Discord
      await applyRoles(body.discordId, { add: [BL_ROLE_ID], remove: [WL_ROLE_ID, CANDIDATE_ROLE_ID] }, 'api/bl');
      // DM au joueur
      try {
        const user = await client.users.fetch(body.discordId).catch(() => null);
        if (user) {
          await user.send({ embeds: [{
            color: 0xFF1A1A,
            title: 'Whitelist refusee',
            description: [
              'Ta demande de whitelist sur **District WL** a ete **refusee**.',
              '',
              '> **Raison :** ' + raison,
              '',
              "Si tu penses qu'il s'agit d'une erreur, ouvre un ticket sur notre serveur Discord en expliquant ta situation.",
            ].join('\n'),
            footer: { text: 'District WL' },
            timestamp: new Date().toISOString()
          }]});
        }
      } catch(e) { console.error('[BL site DM]', e.message); }
      return jsonRes(res, 200, { ok: true });
    }

    // POST /api/whitelist/unbl { discordId } — Retirer la blacklist via site admin
    if (pathname === '/api/whitelist/unbl' && method === 'POST') {
      const body = await readBody(req);
      if (!body.discordId) return jsonRes(res, 400, { error: 'discordId requis' });
      await col('whitelist').updateOne(
        { discordId: body.discordId },
        { $unset: { blacklisted: '', blacklistedAt: '', blacklistedBy: '', blacklistReason: '' } }
      );
      await applyRoles(body.discordId, { remove: [BL_ROLE_ID] }, 'api/unbl');
      return jsonRes(res, 200, { ok: true });
    }

    // POST /api/whitelist/addwl { discordId } — Whitelister via site admin
    if (pathname === '/api/whitelist/addwl' && method === 'POST') {
      const body = await readBody(req);
      if (!body.discordId) return jsonRes(res, 400, { error: 'discordId requis' });
      const entry = await col('whitelist').findOne({ discordId: body.discordId });
      await col('whitelist').updateOne(
        { discordId: body.discordId },
        { $set: { whitelisted: true, whitelistedAt: new Date(), whitelistedBy: 'admin-web', blacklisted: false } },
        { upsert: true }
      );
      // Roles Discord
      await applyRoles(body.discordId, { add: [WL_ROLE_ID], remove: [CANDIDATE_ROLE_ID, BL_ROLE_ID] }, 'api/addwl');
      // DM de confirmation au joueur
      try {
        const user = await client.users.fetch(body.discordId).catch(() => null);
        if (user) {
          const pseudo = entry?.discordPseudo || user.username;
          const charName = entry ? ((entry.persoPrenom || '') + ' ' + (entry.persoNom || '')).trim() : '';
          await user.send({ embeds: [{
            color: 0x4ADE80,
            title: 'Felicitations — Whitelist obtenue !',
            description: [
              'Bonjour **' + pseudo + '**,',
              '',
              'Apres examen de ta candidature, les Douaniers de District WL t\'ont accorde ta **whitelist**.',
              '',
              'Tu peux desormais rejoindre le serveur et commencer ton aventure.',
              charName ? '\n> **Personnage :** ' + charName : '',
              entry?.qcmScore ? '> **Score QCM :** ' + entry.qcmScore + ' / 20' : '',
            ].filter(Boolean).join('\n'),
            footer: { text: 'District WL · Bonne aventure !' },
            timestamp: new Date().toISOString()
          }]});
        }
      } catch(e) { console.error('[addwl site DM]', e.message); }
      return jsonRes(res, 200, { ok: true });
    }

    // GET /api/whitelist/all — Toutes les candidatures pour le panel admin
    if (pathname === '/api/whitelist/all' && method === 'GET') {
      const all = await col('whitelist').find({}).sort({ submittedAt: -1 }).toArray();
      return jsonRes(res, 200, toJSONArr(all));
    }


    // GET /api/discord/stats — Total membres du serveur (pour l'index)
    if (pathname === '/api/discord/stats' && method === 'GET') {
      try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return jsonRes(res, 200, { memberCount: 0 });
        // Fetch fresh member count
        const g = await client.guilds.fetch(GUILD_ID).catch(() => null);
        const count = g ? g.memberCount : guild.memberCount;
        return jsonRes(res, 200, { memberCount: count || 0 });
      } catch(e) {
        return jsonRes(res, 200, { memberCount: 0 });
      }
    }

    // GET /api/discord/member-check?discordId=xxx — Verifier si le user est dans le serveur
    if (pathname === '/api/discord/member-check' && method === 'GET') {
      const discordId = parsed.query.discordId;
      if (!discordId) return jsonRes(res, 400, { error: 'discordId requis' });
      try {
        const guild  = client.guilds.cache.get(GUILD_ID);
        if (!guild) return jsonRes(res, 200, { isMember: false });
        const member = await guild.members.fetch(discordId).catch(() => null);
        const bl = await col('whitelist').findOne({ discordId, blacklisted: true });
        return jsonRes(res, 200, { isMember: !!member, blacklisted: !!bl, blacklistReason: bl?.blacklistReason || '' });
      } catch(e) {
        return jsonRes(res, 200, { isMember: false, blacklisted: false });
      }
    }

    // GET /api/whitelist/members — liste des joueurs whitelistés
    if (pathname === '/api/whitelist/members' && method === 'GET') {
      const members = await col('whitelist').find({ whitelisted: true }, {
        projection: { discordId:1, discordPseudo:1, discordAvatar:1, persoPrenom:1, persoNom:1, persoAge:1, persoOrigine:1, qualites:1, defauts:1, histoire:1, objectifs:1, whitelistedAt:1 }
      }).sort({ whitelistedAt: -1 }).toArray();
      return jsonRes(res, 200, toJSONArr(members));
    }

if (pathname === '/api/public-config') {
      return jsonRes(res, 200, {
        discordInvite:          DISCORD_INVITE,
        discordGuildID:         DISCORD_GUILD_ID,
        boutiqueURL:            BOUTIQUE_URL,
        reglementURL:           REGLEMENT_URL,
        topServeurURL:          TOP_SERVEURS_URL,
        heroBackground:         HERO_BACKGROUND,
        botServerURL:           SITE_URL,
        twitchClientID:         TWITCH_CLIENT_ID,
        twitchAccessToken:      TWITCH_ACCESS_TOKEN_VAR,
        discordOAuthClientID:   CLIENT_ID,
        discordOAuthRedirectURI: REDIRECT_URI,
      });
    }

    // ── PAGES PROTÉGÉES ──────────────────────────────────────────
    // admin.html, gestion.html, gestion_backup.html
    // → accessibles uniquement si l'utilisateur est admin vérifié
    const pageFilename = pathname.replace(/^\/pages\//, '');
    if (pathname.startsWith('/pages/') && PROTECTED_PAGES.includes(pageFilename)) {
      // Le frontend passe son discord_id en query param pour vérification
      // ex: /pages/admin.html?discord_id=123456789
      const discordId = parsed.query.discord_id;
      if (!discordId) {
        // Pas d'ID → redirection vers l'accueil avec message d'erreur
        res.writeHead(302, { Location: `${SITE_URL}/?auth_error=not_admin` });
        return res.end();
      }
      const admin = await col('admins').findOne({ id: discordId });
      if (!admin) {
        res.writeHead(302, { Location: `${SITE_URL}/?auth_error=not_admin` });
        return res.end();
      }
      // Admin vérifié → servir le fichier normalement
      const pagePath = path.join(PAGES_DIR, pageFilename);
      if (!pagePath.startsWith(PAGES_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
      fs.readFile(pagePath, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1>'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    // Static files
    const fullPath = path.join(SITE_DIR, pathname === '/' ? '/index.html' : pathname);
    if (!fullPath.startsWith(SITE_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    const ext  = path.extname(fullPath).toLowerCase();
    fs.readFile(fullPath, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type':'text/html' }); return res.end('<h1>404</h1>'); }
      res.writeHead(200, { 'Content-Type': MIME[ext]||'application/octet-stream', 'Access-Control-Allow-Origin':'*' });
      res.end(data);
    });

  }).listen(HTTP_PORT, () => {
    console.log(`\nServeur HTTP → http://localhost:${HTTP_PORT}`);
    console.log('  /api/news      GET POST PATCH DELETE  [MongoDB]');
    console.log('  /api/streamers GET POST DELETE        [MongoDB]');
    console.log('  /auth/admins   GET POST DELETE        [MongoDB]');
    console.log('  /api/whitelist GET POST             [MongoDB]');
    console.log('  /api/fivem     Proxy FiveM');
    console.log('  /auth/discord/callback  OAuth\n');
  });
}

client.login(TOKEN);

// ── GESTION GLOBALE DES ERREURS ───────────────────────────────────
// Empêche le bot de crasher sur une interaction expirée (code 10062)
client.on('error', err => {
  console.error('[Discord] Erreur client (non-fatale) :', err.message ?? err);
});

process.on('unhandledRejection', (reason) => {
  if (reason?.code === 10062 || reason?.code === 10008) {
    console.warn('[Discord] Interaction expirée ignorée (code', reason.code, ')');
    return;
  }
  console.error('[Process] Unhandled Rejection :', reason);
});