// ============================================================
//  SCRIPT DE MIGRATION — JSON → MongoDB
//  Lance une seule fois : node migrate.js
// ============================================================

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = process.env.MONGO_DB || 'evoria';

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')); }
  catch { return def; }
}

async function migrate() {
  if (!MONGO_URI || MONGO_URI.includes('VOTRE_USER')) {
    console.error('❌ Configure MONGO_URI dans .env avant de lancer la migration !');
    process.exit(1);
  }

  console.log('🔌 Connexion à MongoDB...');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`✅ Connecté → base "${DB_NAME}"\n`);

  const collections = [
    { file: 'admins.json',    name: 'admins',    def: [] },
    { file: 'news.json',      name: 'news',      def: [] },
    { file: 'streamers.json', name: 'streamers', def: [] },
    { file: 'reminders.json', name: 'reminders', def: [] },
    { file: 'claims.json',    name: 'claims',    def: {} },
  ];

  for (const { file, name, def } of collections) {
    const raw = readJSON(file, def);
    // claims est un objet { discordId: {...} }, on le convertit en tableau
    const data = Array.isArray(raw) ? raw : Object.values(raw);

    if (!data.length) {
      console.log(`⏭️  ${name} — vide, rien à migrer`);
      continue;
    }

    // Vérifier si déjà des données
    const existing = await db.collection(name).countDocuments();
    if (existing > 0) {
      console.log(`⚠️  ${name} — ${existing} document(s) déjà présents, migration ignorée`);
      continue;
    }

    await db.collection(name).insertMany(data);
    console.log(`✅ ${name} — ${data.length} document(s) importés`);
  }

  // Créer les index
  await db.collection('admins').createIndex({ id: 1 }, { unique: true }).catch(() => {});
  await db.collection('reminders').createIndex({ discordId: 1 }, { unique: true }).catch(() => {});
  await db.collection('claims').createIndex({ discordId: 1, month: 1 }).catch(() => {});
  console.log('\n✅ Index créés');

  await client.close();
  console.log('\n🎉 Migration terminée ! Tu peux maintenant supprimer les fichiers .json (sauf claims.json si tu veux garder une copie)');
  console.log('   Fichiers concernés : admins.json, news.json, streamers.json, reminders.json, claims.json');
}

migrate().catch(err => { console.error('❌ Erreur migration :', err); process.exit(1); });
