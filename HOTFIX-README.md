# Free Navy Netlify migration 0004 hotfix

This hotfix repairs the failed `0004_governance_operations` database migration.

## Cause

Migration `0002_admin_console.sql` created `public.site_settings.value`, while migration `0004_governance_operations.sql` attempted to insert into `public.site_settings.setting_value`.

## Fix

- Migration 0004 now detects the legacy `value` column and renames it to `setting_value` before it is used.
- It also handles partial databases where both column names exist.
- `public-config.mjs` now reads the canonical `setting_value` column.
- A regression test checks that the mismatch cannot return unnoticed.

## GitHub upload

Replace these files in the repository, keeping the same paths:

1. `netlify/database/migrations/0004_governance_operations.sql`
2. `netlify/functions/public-config.mjs`
3. `tests/patch-structure.mjs`

Commit the changes and trigger a new Netlify deploy.

The failed 0004 migration should rerun. A database reset is not normally required because the migration is additive and repeat-safe. The project is still in testing, so resetting the Netlify database remains a fallback if Netlify reports that the failed migration is locked or dirty.
