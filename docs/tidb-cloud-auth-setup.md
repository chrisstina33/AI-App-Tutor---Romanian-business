# TiDB Cloud setup for authentication

The API uses MySQL-compatible Drizzle migrations. Account registration, sign-in,
sessions, and learner progress require the `0002_auth_parent_accounts` migration.

1. Create a TiDB Cloud Serverless cluster and database. Create or select a
   database user with permissions to create and modify tables in that database.
2. In the cluster's connection details, select the Node.js/MySQL connection
   method and copy its connection URL. Keep the password private; URL-encode
   special characters in the username or password if the URL requires it.
3. Configure the **Render API service** environment:
   - `DATABASE_URL`: the TiDB MySQL connection URL, including the database name.
   - `DATABASE_SSL`: `true` for TiDB Cloud's TLS connection.
   - `CORS_ALLOWED_ORIGINS`: the exact production Vercel origin, plus any
     development origins you use.
4. Apply migrations from the repository root in an environment that can reach
   the cluster:

   ```sh
   DATABASE_URL='mysql://USER:PASSWORD@HOST:4000/DATABASE' \
   DATABASE_SSL=true pnpm db:migrate
   ```

   Prefer running this command locally with the TiDB connection URL supplied
   through your shell or a private local environment file. Do not commit the URL.
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
