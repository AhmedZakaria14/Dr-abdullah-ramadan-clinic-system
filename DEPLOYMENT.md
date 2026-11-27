# Clinic CRM production deployment

The React frontend can stay on its Vercel domain. Its API function forwards requests to one continuously running Node.js backend. That backend owns the SQLite database, Google Sheets sync, and event streams for all clinic accounts. It can also serve the built frontend directly.

## Prepare the persistent backend

1. Use Node.js 22.13 or newer with native SQLite, and mount a writable persistent volume. Keep the SQLite database, WAL, and integration key file on the volume. Use a single backend replica and one database writer.
2. Restore a consistent backup of the current production database before starting the new backend. For a SQLite source, make the backup with SQLite's online backup command, such as `sqlite3 /path/to/current.db ".backup /safe/path/clinic-backup.db"`. If there are several instance snapshots, reconcile them privately before selecting the production copy. The sheet can restore incoming form data. Accounts, read state, notes, assignments, and follow-ups need a database backup. Treat older database copies and their WAL files as sensitive.
3. Configure `DATABASE_PATH` with the absolute path to the restored database on the volume. Configure a stable `AUTH_SESSION_SECRET` of at least 32 random characters. A changed signing secret requires users to sign in again. If the owner account is missing, startup requires a strong `ADMIN_DEFAULT_PASSWORD`. Restored account passwords are preserved. If the owner used the old default password, change it in the restored preview before switching traffic.
4. Carry over `INTEGRATION_ENCRYPTION_KEY` (or the original `.encryption.key` file) if the database contains encrypted Meta settings. Preserve `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` if Meta webhooks are active.
5. Run `npm install --include=dev` and `npm run build`. Start the backend with `npm start`. Expose it through an HTTPS origin. The API health response should show `ok: true` and `storage: "persistent"`.

## Connect Google Sheets

Enable the Google Sheets API, configure the backend's `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`, and share each linked private spreadsheet directly with the service account email as Viewer. Keep the credential in the backend's environment. Existing public sheets can also use their CSV export.

The backend checks enabled sources even with the dashboard closed. The default interval is 15 seconds and Google throttling can extend it. Once an import commits, the backend broadcasts it to connected clients. If the event stream disconnects, a visible dashboard checks the API every 10 seconds until it reconnects. A missing sheet row leaves the CRM record and its history available. Explicit ID columns are recommended for sheets whose identifying fields can be edited.

## Switch Vercel to the persistent backend

1. Set `CRM_API_ORIGIN` to the backend HTTPS origin on a preview deployment first. The API function returns 503 when the origin is missing.
2. Verify the preview API health endpoint, sign in with two browser sessions, and check the read/unread state and sheet status. Confirm the deployment webhook still receives raw request bytes if Meta is in use.
3. Set the same variable in the production environment after verifying the database backup and preview. Vercel can deploy automatically from `main` once the project is linked. If the production variables change, redeploy to apply them.
4. Verify production health and both sessions after deploying. To roll back, restore the previous production deployment and keep the persistent database backup. Keep the database volume and its backup private.

## Local verification

```bash
npm run lint
npm run build
npm run test:clinic
```

The clinic tests use a temporary SQLite file and synthetic records. The existing acceptance suite also contains Al-Safa fixtures from the previous project and is separate from the clinic checks.
