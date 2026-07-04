# Free Navy 4.8.2 baseline patch changes

## Database

- Added `0006_live_patch_baseline_and_catalog.sql` after the existing five migrations.
- Added a 4.8.2 baseline state using `4.8.2-LIVE.12030094`.
- Added source health, source patch, import counts, rejection counts and failure details.
- Added normalized ship, ground vehicle, blueprint and blueprint-material records.
- Added patch campaigns and verification tasks.
- Repaired missing `material_name` columns used by campaign and crafting workflows.
- Added source identifiers to the existing `blueprints` table so imported data reaches the member-facing crafting page.
- Added the missing `change_reason` field used by the imported-data editor.

## Import and publishing

- Imports vehicles and blueprints from the versioned Star Citizen Wiki API.
- Separates ships from ground vehicles.
- Publishes imported ships and vehicles to the existing portal game catalog.
- Publishes imported blueprints and ingredients to the existing crafting library.
- Rejects PTU, EPTU, Evocati and Tech Preview records.
- Refuses zero-record imports so a broken source cannot erase working data.
- Preserves Officer-locked corrections during later source updates.
- Allows imported test data to be reset from Admin while the project is in setup.

## Admin and feature switches

- Game Data Library and LIVE Verification require import/admin permission.
- Added one Admin-only Game Data and LIVE Verification control page.
- Feature switches now hide and block their matching routes immediately.
- Private Recruitment now blocks new signup links and applications when disabled.
- Discord is installed but disabled by default until Netlify environment variables validate.

## GitHub and Netlify

- Added GitHub Actions validation.
- Added Netlify environment documentation.
- Added syntax, permission, patch-version and patch-structure tests.
- The production bundle is rebuilt by `npm run build`.
