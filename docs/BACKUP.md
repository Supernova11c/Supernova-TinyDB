# Backup and recovery

Run `npm run backup` to use SQLite's online backup API to create a timestamped consistent copy under `backups/` (or `BACKUP_PATH`). Set `DATABASE_PATH` to the active DB location. Backups contain personal/project data and secrets metadata; protect and encrypt them at rest and restrict access.

Recovery procedure:

1. Stop the application and verify the backup file is intact.
2. Copy the backup to the configured database path (preserve the previous file separately).
3. Start the application and check `/health`.
4. Run `PRAGMA integrity_check;` using SQLite tooling and verify expected projects/collections.
5. Perform an authorized read and write against a test project before restoring service.

Keep backups off-host and encrypted in production. This script creates a backup but does not schedule, replicate, encrypt, prune, or test recovery automatically. Regularly rehearse restoration.
