## 4.1.2 - Netlify transaction hotfix

- Removed explicit `BEGIN;` and `COMMIT;` statements from migrations `0006_live_patch_baseline_and_catalog.sql` and `0007_discord_integrations.sql`.
- Netlify Database now owns the migration transaction from start to finish, preventing `pq: unexpected transaction status idle`.
- Added a regression test that rejects standalone `BEGIN;`, `COMMIT;`, or `ROLLBACK;` statements in migration files.

## 4.1.1 - Netlify migration repair

- Repaired migration `0004_governance_operations.sql` so databases created by migration 0002 rename the legacy `site_settings.value` column to `setting_value` before governance settings are inserted.
- Added compatibility handling for partially migrated databases where either or both column names may exist.
- Updated the public configuration Function to use the canonical `setting_value` column.
- Added regression checks for the migration sequence.

# Changelog

## 2.2.0

- Replaced the legacy six-role system with Petty Officer, Officer, Vice President and President.
- Set Petty Officer as the default role for new accounts.
- Added server-side hierarchy checks for invitations, role changes and removals.
- Allowed Officers to invite and manage Petty Officers.
- Allowed Officers to administer warehouse records and shortage work orders.
- Allowed Officers to approve submissions and manage announcements.
- Added full leadership page-content, background and website-settings management.
- Added searchable audit history.
- Added member suspension, banning, reactivation, password reset and Identity deletion controls.
- Kept JSON backup on its own Vice President/President page.
- Added RSI and Discord handle editing to member profiles.
- Added automatic role conversion for existing installations.
- Added President bootstrap synchronisation with Netlify Identity.
- Preserved existing announcements as published during migration.
- Fixed old front-end role checks that could redirect valid Officers or leaders away from restricted pages.
- Added role matrix and redeployment documentation.
