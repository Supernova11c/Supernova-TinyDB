# Feature status

The platform implements SQLite end-to-end. PostgreSQL and MongoDB adapters are included as optional server-side providers and require testing and provisioning. MySQL is listed but not implemented. Arbitrary client connection strings are never executed; project database URIs must be supplied by the trusted dashboard/API process environment or a future secrets service.

## Security status

- Passwords use scrypt.
- Sessions use hashed opaque cookies with HttpOnly and Strict SameSite.
- Public credentials are SHA-256 hashed.
- Dashboard actions verify the verified owner.
- SQL record queries are project-scoped.
- Public writes require collection permissions.
- JSON request size is limited to 256 KiB.
- Helmet, CORS allowlists, and rate limits are enabled.

Before production, add SMTP delivery, CSRF/origin enforcement for state-changing dashboard requests, Redis-backed distributed rate limits, encryption for stored database URIs, scheduled backups, MFA, password recovery, and load testing. Million-project scale is not claimed or tested.
