# Supernova TinyDB

Supernova DB is a persistent backend-as-a-service for static websites.

## Run

```sh
cp .env.example .env
npm install
npm run sdk:build
npm start
```

Requires Node.js 20+.

## Storage providers

SQLite is enabled end-to-end. PostgreSQL and MongoDB provider adapters are present as integrations requiring deployment credentials and provider-specific validation. MySQL is an optional package placeholder. Never expose database URLs to the browser.

Create projects using `POST /v1/dashboard/projects` with `database_provider: "sqlite"`, or a trusted server-provisioned URI for PostgreSQL/MongoDB.

## Features

- Email registration and verification
- Secure login sessions
- Project and credential management
- Public/project credential validation
- Collection and record CRUD
- Collection-level public permissions
- Browser SDK
- Professional dashboard
- SQLite WAL persistence and online backup
- Audit logs and pagination
- Storage provider registry
- Docker deployment

See [API](docs/API.md), [getting started](docs/GETTING_STARTED.md), [deployment](docs/DEPLOYMENT.md), [backups](docs/BACKUP.md), and [security status](docs/SECURITY_STATUS.md).
