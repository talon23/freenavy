FREE NAVY SITE_SETTINGS HOTFIX
==============================

Replace exactly these two files in the GitHub repository:

1. netlify/database/migrations/0004_governance_operations.sql
2. netlify/functions/public-config.mjs

Do not add a new migration number and do not rename 0004. The 0004 migration failed,
so Netlify will retry it after this corrected version is committed.

The patch adds the missing `setting_value` column, copies existing JSON from the
legacy `value` column, and preserves all existing settings.
