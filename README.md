# Supernova TinyDB

Supernova DB provides persistent database APIs for static websites, with project-scoped credentials and a small developer dashboard.

## Run locally

Requires Node.js 20+ and a C++ build toolchain for `better-sqlite3`.

```sh
cp .env.example .env
npm install
npm start
```

Visit `http://localhost:3000`. For local verification, a one-time email link is printed in the server log. After verification and sign-in, create a project and collection. This development verification mechanism is not production email delivery.

## Current database support

SQLite is the only implemented storage engine in this version. The app persists metadata and records in SQLite with WAL, foreign keys, composite project/collection scoping, and indexed pagination. PostgreSQL and MongoDB are not yet selectable providers; the architecture does not currently allow arbitrary database providers. See [deployment guidance](docs/DEPLOYMENT.md) before deploying.

## Public API and SDK

The public credential is read-only by default. See [API reference](docs/API.md) and [getting started](docs/GETTING_STARTED.md). Build the browser asset with `npm run sdk:build`.

## Tests and backup

```sh
npm test
npm run backup
```

This repository is an early, single-node implementation. It has not been load tested for millions of projects and is not production ready until the email delivery, operational controls, and security limitations in the deployment guide are addressed.
