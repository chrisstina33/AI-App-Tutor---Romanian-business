# TiDB Cloud setup for authentication

The API uses MySQL-compatible Drizzle migrations. Account registration, sign-in,
sessions, and learner progress require the `0002_auth_parent_accounts` migration.

1. Create a TiDB Cloud Serverless cluster and database. Create or select a
   database user with permissions to create and modify tables in that database.
2. In the cluster's connection details, select the Node.js/MySQL connection
   method. If Connect shows separate fields, use the matching
   `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, and `DATABASE_PASSWORD`
   values below. The application database name is `elunariq`; keep the built-in
   `sys` database and do not use it for the application.
3. Configure the **Render API service** environment:
   - Either `DATABASE_URL` for a MySQL connection URL ending in `/elunariq`, or
     all of `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`,
     `DATABASE_PASSWORD`, and `DATABASE_NAME=elunariq`.
   - `DATABASE_SSL`: `true` for TiDB Cloud's TLS connection.
   - `CORS_ALLOWED_ORIGINS`: the exact production frontend origin (scheme and
     hostname only, no trailing slash), plus any development origins you use.
     The current Vercel origin is allowlisted by the API; add any custom domain
     or replacement Vercel deployment here.
4. Apply migrations from the repository root in an environment that can reach
   the cluster:

   ```sh
   DATABASE_HOST='YOUR-HOST' DATABASE_PORT='4000' \
   DATABASE_USER='YOUR-USER' DATABASE_PASSWORD='YOUR-PASSWORD' \
   DATABASE_NAME='elunariq' \
   DATABASE_SSL=true pnpm db:migrate
   ```

   Prefer running this command locally with these settings in a private `.env`
   file (which is gitignored), or configured in the shell. Do not commit
   connection details.
   It is also possible to run it from a one-off Render shell after setting the
   same environment variables.
5. Redeploy or restart the Render API after setting its variables. Set
   `EXPO_PUBLIC_API_BASE_URL` in the Vercel project to the Render API base URL,
   then redeploy Vercel so the client uses that API.
6. Verify `https://YOUR-RENDER-SERVICE/api/health`, then create and sign in to a
   test account in the app. A successful health response only verifies the API;
   account creation verifies the database connection and auth migration.

If authentication still reports that the database or migration is unavailable,
check Render's server logs for the database connection or migration error. Never
paste the TiDB connection URL or password into source control or public logs.
An `ER_ACCESS_DENIED_ERROR` means TiDB rejected the configured user or password;
re-copy the Node.js/MySQL credentials from the cluster and confirm that the user
has access to `elunariq`. The local `.env` file does not configure Render.
