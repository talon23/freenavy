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
