# API reference

All endpoints return `{ success, data, error }`. Errors use stable codes; do not rely on error message text. JSON request body limit is 256 KiB.

## Public data API

Supply `X-Project-ID` and `X-Public-Key`. Keys are project-scoped and stored as SHA-256 hashes. The public key can be included in browser code and is read-only unless explicitly granted scoped collection permissions.

- `GET /v1/data/:collection?limit=50&offset=0` — fetch a page (maximum 100).
- `POST /v1/data/:collection` — insert an object only when collection insert permission is enabled.
- `PUT /v1/data/:collection/:recordId` — update only when update permission is enabled.
- `DELETE /v1/data/:collection/:recordId` — delete only when delete permission is enabled.

Records are always queried with project and collection IDs in the server-side query. SQL identifiers are not derived from user input.

## Authentication

- `POST /v1/auth/register` `{ email, password }` (minimum 12 characters).
- `POST /v1/auth/verify` `{ token }`.
- `POST /v1/auth/login` `{ email, password }` (sets an HttpOnly, SameSite=Lax cookie).
- `POST /v1/auth/logout`.
- `GET /v1/auth/me`.

For local development, verification URL is printed to the server console. Configure SMTP integration before public production signup; no verification email is sent in this release.

## Dashboard endpoints (verified session required)

- `GET, POST /v1/dashboard/projects`.
- `GET /v1/dashboard/projects/:projectId`.
- `POST /v1/dashboard/projects/:projectId/rotate/:kind` where kind is `public` or `admin`.
- `GET /v1/dashboard/projects/:projectId/collections`.
- `POST /v1/dashboard/projects/:projectId/collections` `{ name }`.
- `PATCH, DELETE /v1/dashboard/projects/:projectId/collections/:collectionId`.
- `GET, POST /v1/dashboard/projects/:projectId/collections/:collectionId/records`.
- `PUT, DELETE /v1/dashboard/projects/:projectId/collections/:collectionId/records/:recordId`.
- `GET /v1/dashboard/projects/:projectId/credentials` (metadata only, never secrets).
- `GET /v1/dashboard/projects/:projectId/activity`.

Dashboard sessions authorize privileged actions; the generated admin credential is never accepted by the public data API and is not returned again after project creation. Rotate it if it was not securely retained.

## Error codes

`PROJECT_NOT_FOUND`, `INVALID_CREDENTIAL`, `EXPIRED_CREDENTIAL`, `ACCESS_DENIED`, `COLLECTION_NOT_FOUND`, `RECORD_NOT_FOUND`, `INVALID_REQUEST`, `RATE_LIMITED`, `INTERNAL_SERVER_ERROR`.
