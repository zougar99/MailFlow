# 📧 MailFlow

Suite d'outils de gestion de flux de travail.

## Structure

```
/
├── email-app/        # Email Control — connexion Gmail/Outlook + analyse IA
├── email/            # (préparé pour usage futur)
├── package.json      # Workspace root (npm workspaces)
└── README.md
```

## Démarrer

```bash
npm install

# Lancer l'app Email Control seulement
npm run dev:email

# Lancer les deux apps (quand le workspace web/ sera présent)
npm run dev:all
```

L'app Email Control tourne sur **http://localhost:3001** par défaut.

## Apps

### Email Control

Application Next.js pour connecter Gmail et Outlook, scanner les boîtes de réception, analyser les messages avec l'IA, et appliquer automatiquement des libellés/catégories.

- OAuth Gmail + Microsoft Graph
- Analyse IA des messages en lots
- Application automatique de labels (Gmail) / catégories (Outlook)
- File d'attente locale (localStorage)

## Configuration

Copier `.env.example` vers `.env.local` dans `email-app/` et remplir :
- `EMAIL_OAUTH_SECRET` — clé de chiffrement des sessions OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — identifiants Gmail API
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` — identifiants Microsoft Graph
- Variables IA : `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`
