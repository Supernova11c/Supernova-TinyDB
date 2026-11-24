# Supernova TinyDB

Supernova DB is a persistent backend-as-a-service for static websites. It provides email authentication, project credential isolation, collection/record CRUD, an administration dashboard, and a browser SDK.

## Quick start

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`. SQLite is used locally and can be replaced by PostgreSQL-compatible storage for production deployments.

## Development

```bash
npm test
npm run dev
```

## Public API

Send `X-Project-ID` and `X-Public-Key` headers.

```js
const response = await fetch('http://localhost:3000/v1/data/notes', {
  headers: {
    'X-Project-ID': 'YOUR_PROJECT_ID',
    'X-Public-Key': 'YOUR_PUBLIC_KEY'
  }
});
```

Every response is JSON: `{ success, data, error }`. The public key starts with read-only access. Collection write permissions are disabled until explicitly configured by a dashboard administrator.

See [docs/API.md](docs/API.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and [docs/BACKUP.md](docs/BACKUP.md).
