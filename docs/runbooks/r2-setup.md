# Cloudflare R2 Setup Runbook

Bucket: `carat-room-assets`
Region: Automatic (Cloudflare-managed)

## Access
API token scoped to `carat-room-assets` — Object Read & Write only.
Credentials in `.env` as `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.

## CORS
Configured to allow GET and PUT from the user portal origin.
PUT is used for pre-signed direct browser uploads from the admin portal.

## Upload flow
1. Admin requests a pre-signed PUT URL from Catalogue Service
2. Browser uploads the image directly to R2 — no binary data passes through any service
3. Catalogue Service stores the returned R2 URL

## Updating allowed origins
Edit the CORS policy in the Cloudflare R2 dashboard when adding new domains.
