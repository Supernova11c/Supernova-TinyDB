# Supernova implementation status

## Implemented

- SQLite persistent storage with WAL, foreign keys, JSON validation, scoped indexes, transaction-safe writes.
- Registration, scrypt password hashing, verification, login/logout, opaque HttpOnly sessions, logout, password reset flow API.
- Project creation, owner verification, public/admin credential hashes, credential rotation.
- Project, collection, and record CRUD; scoped public API; collection read/insert/update/delete permissions.
- Pagination, JSON response format, stable errors, rate limiting, Helmet, CORS allowlist, request-size limits.
- Audit log metadata and provider registry.
- Browser dashboard and SDK.
- SMTP-ready email delivery and console fallback for local development.
- Online SQLite backup script and Docker deployment files.

## Requires real infrastructure or further implementation

- PostgreSQL, MySQL, and MongoDB adapters are not all production-complete.
- Distributed Redis rate limiting and quotas.
- Automated backups, encryption at rest, monitoring, and restore automation.
- MFA and advanced account controls.
- Million-project load testing.

No provider or scale claim is made until integration tests and measured load tests pass.
