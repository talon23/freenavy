# Free Navy GitHub and Netlify patch

This package is the complete Free Navy repository with the 4.8.2 baseline patch already merged.

## What it does

- Uses **4.8.2-LIVE.12030094** as the initial source-data baseline.
- Checks the official RSI LIVE version separately from the baseline.
- Imports ships, ground vehicles, blueprints and blueprint materials.
- Publishes imported data into the portal pages already used by members and Officers.
- Keeps the Game Data Library and LIVE Verification controls behind authorised access.
- Fixes the missing `material_name` campaign error.
- Makes feature switches control real navigation and direct page access.
- Installs Discord account linking and webhooks, switched off by default.

## Deploy through GitHub and Netlify

1. Replace the files in the GitHub repository with this package.
2. Do not upload `node_modules`.
3. Commit and push:

```bash
git add .
git commit -m "Add 4.8.2 baseline and LIVE data controls"
git push
```

4. Netlify will run:

```bash
npm run build
```

5. In Netlify, use **Deploys → Trigger deploy → Clear cache and deploy site** if the automatic deployment uses an old cache.

## Database migrations

The existing project already contains migrations `0001` to `0005`.
This patch adds:

```text
netlify/database/migrations/0006_live_patch_baseline_and_catalog.sql
netlify/database/migrations/0007_discord_integrations.sql
```

The project is still in setup/testing. Imported data can be cleared from **Admin → Game Data & LIVE Verification → Reset imported test data**.

## First Admin run

1. Sign out and back in after deployment.
2. Open **Game Data & LIVE Verification** in the restricted navigation area.
3. Press **Import 4.8.2 ships & blueprints**.
4. Wait for the source status to show `ok` and confirm counts are above zero.
5. Press **Check RSI LIVE patch**.
6. Create a verification campaign for the detected LIVE patch when required.

## Local validation before pushing

```bash
npm ci
npm run validate
```

See `NETLIFY-ENVIRONMENT.md` for variables and `PATCH-FILE-WALKTHROUGH.md` for the file-by-file explanation.
