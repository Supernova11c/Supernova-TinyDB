# Phase 2 — storage/API integration

This phase aligns the storage adapter contract used by the API:

- `listRecords`, `insertRecord`, `updateRecord`, and `deleteRecord` are available for SQLite.
- External PostgreSQL, MySQL/MariaDB, and MongoDB providers are opt-in through server-side URLs.
- External records are scoped by both `project_id` and `collection_id`.
- Provider failures return an unavailable-storage error instead of silently falling back to another project or provider.
- SQLite online backups use the configured database path.

Run `npm test` and `npm start` after installing dependencies. Provider integration tests should run against disposable database instances before production use.
