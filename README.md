# Evoria RP — Site Web v4.0

## Architecture

```
evoria_fixed/
├── index.html          ← Page principale
├── config.js           ← ⚠️ Configuration à modifier
├── assets/
│   ├── js/script.js    ← Frontend (appelle le bot via API)
│   └── css/style.css
├── pages/
│   ├── gestion.html    ← Panel admin
│   └── streamers.html
└── bot/
    ├── bot.js          ← Bot Discord + Serveur HTTP + API
    ├── .env            ← ⚠️ Variables à configurer
    ├── admins.json     ← Liste des admins (géré par le bot)
    ├── news.json       ← Actualités (sync tous appareils ✅)
    └── streamers.json  ← Streamers (sync tous appareils ✅)
```

## Pourquoi les données étaient perdues entre PC et téléphone ?

L'ancien système utilisait le **localStorage** du navigateur.
Ce stockage est **local à chaque appareil** — impossible de partager.

La nouvelle version stocke tout dans des **fichiers JSON sur votre serveur**
(géré par le bot Node.js). Tout appareil qui accède au site voit les mêmes données.

---

## Installation & démarrage

### 1. Configurer le `.env`

```env
BOT_TOKEN=...              # Token de votre bot Discord
CLIENT_ID=...              # ID de l'application Discord
GUILD_ID=...               # ID de votre serveur Discord
DISCORD_OAUTH_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://VOTRE_IP_OU_DOMAINE:3000/auth/discord/callback
SITE_URL=http://VOTRE_IP_OU_DOMAINE:3000
HTTP_PORT=3000
FIVEM_IP=213.239.201.48:30290   # ← Votre IP FiveM
```

### 2. Configurer `config.js`

```js
botServerURL: "http://VOTRE_IP_OU_DOMAINE:3000",
discordOAuthRedirectURI: "http://VOTRE_IP_OU_DOMAINE:3000/auth/discord/callback",
```

### 3. Démarrer le bot

```bash
cd bot
npm install
node bot.js
```

Le bot sert à la fois de **bot Discord** et de **serveur web** pour le site.
Accédez au site via `http://VOTRE_IP:3000`

---

## API disponible

| Méthode | Route             | Description                      |
|---------|-------------------|----------------------------------|
| GET     | `/api/fivem`      | Joueurs en ligne (sans CORS ✅)  |
| GET     | `/api/news`       | Liste des actualités             |
| POST    | `/api/news`       | Créer une actualité              |
| PATCH   | `/api/news`       | Modifier (pin/featured/ordre)    |
| DELETE  | `/api/news?id=X`  | Supprimer une actualité          |
| GET     | `/api/streamers`  | Liste des streamers              |
| POST    | `/api/streamers`  | Ajouter un streamer              |
| DELETE  | `/api/streamers?id=X` | Supprimer un streamer        |

---

## Commandes Discord

| Commande          | Description                          |
|-------------------|--------------------------------------|
| `/addadmin`       | Ajouter un admin au site             |
| `/deleteadmin`    | Retirer un admin du site             |
| `/listadmin`      | Lister tous les admins               |

---

## Pourquoi le compteur FiveM ne marchait pas ?

Le navigateur bloque les requêtes HTTP vers votre serveur FiveM (protection CORS).
La nouvelle version passe par le **proxy `/api/fivem`** du bot — la requête est faite
côté serveur, sans aucun blocage CORS.
