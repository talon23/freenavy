# Free Navy v4 redeploy checklist

This update is designed to upgrade the existing Netlify portal without deleting current production data. The new database changes are additive migrations. The existing `0002_admin_console.sql` migration keeps number `0002`; the newer migrations continue from `0003`.

## Before uploading

1. Download a current JSON backup from the existing portal if available.
2. Keep a copy of the current GitHub repository.
3. Extract the v4 package.
4. Do not upload `node_modules` or a real `.env` file.

## Replace the GitHub project

Replace the project files with the contents of this package. Make sure these migration files all remain in the repository:

```text
netlify/database/migrations/0001_free_navy_core.sql
netlify/database/migrations/0002_admin_console.sql
netlify/database/migrations/0003_command_ranks_imports.sql
netlify/database/migrations/0004_governance_operations.sql
netlify/database/migrations/0005_import_corrections.sql
```

Do not rename or delete an older migration after it has already run.

Commit the update with a message such as:

```text
Free Navy v4 command, imports and governance update
```

## Netlify environment variables

Import or confirm:

```env
BOOTSTRAP_OWNER_EMAIL=your-email@example.com
STAR_CITIZEN_LIVE_VERSION=4.8.3
RSI_LIVE_PATCH_URL=
UEX_API_TOKEN=
UEX_CLIENT_VERSION=free-navy-4.0
PRIVATE_SIGNUP_SECRET=replace-with-at-least-32-random-characters
```

`PRIVATE_SIGNUP_SECRET` must be private and difficult to guess. Changing it invalidates previously generated application links.

Discord webhook, OAuth, bot and automated posting variables are not used by this build.

## Deploy

In Netlify use:

**Deploys → Trigger deploy → Clear cache and deploy site**

Wait for:

- npm dependencies installed
- `npm run build` completed
- all five database migrations validated/applied
- Functions bundled
- deploy published

## First login after deployment

1. Sign out of the portal.
2. Close old portal tabs.
3. Sign back in.
4. Confirm your account rank is **President**.
5. Confirm the Admin & Command, LIVE Source Control and JSON Backup pages open.

## Required smoke tests

1. Open Member Directory and copy the daily private application link as an Officer-or-higher account.
2. Submit one test application in a private browser window.
3. Approve it from Admin & Command and confirm it becomes Enlisted or Probationary Enlisted.
4. Give a test user the Quartermaster appointment while retaining their base rank.
5. Confirm that user can manage warehouse data but not treasury data.
6. Give another test user Treasurer and confirm the reverse.
7. Confirm Enlisted can flag an imported record but cannot edit it.
8. Confirm Officer can correct imported data and the record shows **Officer Locked**.
9. Run a dry-run import before running the first real import.
10. Confirm Discord integrations remain disabled under Feature Switches.

## After confirming the President account

Remove `BOOTSTRAP_OWNER_EMAIL` from Netlify and redeploy. The existing President database record remains in place.

## 4.8.2 test-phase deployment

This portal is still in setup/testing and contains no production data that needs preserving. Apply the overlay directly to GitHub, run the patch script, commit and push. Netlify should remain the only host, Functions platform, Identity provider and database platform.

New migrations:

```text
netlify/database/migrations/0006_live_patch_baseline_and_catalog.sql
netlify/database/migrations/0007_discord_integrations.sql
```

After deployment, open **Admin → Game Data & LIVE Verification** and import the 4.8.2 baseline. Use **Reset imported test data** whenever a clean import is needed during testing.

Discord remains off until the variables in `NETLIFY-ENVIRONMENT.md` are added and the Admin tickboxes are enabled.
