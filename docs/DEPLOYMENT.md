# Deployment

This repository is an early, single-instance implementation, not a hosted commercial service or a tested million-project platform. SQLite is the currently implemented metadata and record storage engine. SQLite is appropriate for local use and a modest single-node deployment; do not put its file on an arbitrary network filesystem or run multiple independent writers against copied files.

## Docker

```sh
cp .env.example .env
# Set a long random SESSION_SECRET and correct APP_URL/CORS_ORIGINS.
docker compose up --build
```

Persist `/app/data` and `/app/backups`. Terminate HTTPS at a trusted reverse proxy and set `NODE_ENV=production`. Never expose `.env`, the database file, or backups publicly. Configure a strict CORS origin list. Do not treat CORS as authentication.

## Database engine choice

Only SQLite is wired to the application today. PostgreSQL and MongoDB are not yet implemented as selectable storage adapters. Do not enter production database credentials into the UI; there is no bring-your-own-database feature yet. Adding an engine requires a vetted server-side adapter and migrations, credential isolation, transactions/atomicity policy, backup/restore support, integration tests, and connection lifecycle management. Keep provider URIs server-side; never accept arbitrary client-supplied database connection strings, which could create a server-side request forgery or expose internal services.

## Authentication/email

Development verification links are printed in the process logs. Before production, connect a real mail provider and deliver short-lived verification links. Configure secure cookies and a strong session secret. A reverse proxy must preserve the client IP safely; review Express `trust proxy` for your deployment rather than blindly trusting all proxy headers.

## Limitations

This starter has no password reset, email delivery, multi-factor authentication, distributed rate-limit store, configurable per-project quotas, or automated scheduled backups. Validate operational requirements before accepting real user data.
