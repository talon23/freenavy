# Free Navy Star Citizen Organisation Portal v4

A private, Netlify-only command and operations portal for the Free Navy organisation.

## What this redeploy adds

This release preserves the working portal, login, database, warehouse, crafting, mining, salvage, trade, fleet, operations, auctions and treasury. It then adds:

- Full Free Navy command ranks
- Concurrent Admin, Quartermaster and Treasurer appointments
- Temporary appointments with expiry dates and scopes
- Capability-based server permissions
- A permission matrix and member permission preview
- Departments and an organisation chart
- Daily rotating private recruitment links
- Applicant approval, refusal and requests for more information
- Probationary memberships
- Member suspension, session revocation, password reset and removal
- RSI handle and optional Discord handle profile fields
- Automatic LIVE-only Star Citizen Wiki and UEX data imports
- Immediate member-facing publication after automated checks
- Officer corrections that survive subsequent imports
- Member accuracy flags with explanations and evidence
- Member-submitted locations requiring officer review
- Import health controls, dry runs, pause switches and zero-result protection
- Watchlists and change notifications
- LIVE patch reconfirmation campaigns
- Warehouse equipment checkout and return records
- Two-person approval for configured high-value warehouse and points actions
- Operation templates, live operation rooms and contribution scoring
- Editable organisation knowledge articles with revision history
- Feature switches, announcements, backgrounds and site settings
- Separate JSON backup and restoration page
- Daily, weekly and pre-import backups using Netlify Blobs
- Mobile command mode

Discord OAuth account linking and webhook support are installed but disabled by default until their Netlify environment variables are configured.

## Netlify services used

- Netlify Hosting
- Netlify Identity
- Netlify Database
- Netlify Functions
- Netlify Background Functions
- Netlify Scheduled Functions
- Netlify Blobs

No Supabase project or separate database provider is required.

## Rank model

Every member has exactly one command rank:

1. President
2. Vice President
3. General
4. Admiral
5. Vice Admiral
6. Rear Admiral
7. Brigadier General
8. Officer
9. Enlisted

Permissions are grouped into practical command tiers:

| Tier | Ranks |
|---|---|
| Owner | President |
| Executive | Vice President |
| Senior Command | General, Admiral |
| Command | Vice Admiral, Rear Admiral, Brigadier General |
| Officer | Officer |
| Member | Enlisted |

## Concurrent appointments

Appointments run alongside command rank:

- Admin
- Quartermaster
- Treasurer

Examples:

- Officer + Quartermaster
- Enlisted + Treasurer
- Rear Admiral + Admin
- General + Admin + Treasurer

Only the President and Vice President can assign ranks and appointments. An Admin appointment does not automatically grant warehouse or treasury control.

See [PERMISSIONS.md](PERMISSIONS.md) for the detailed capability matrix.

## Private membership applications

The Member Directory displays a rotating private application link to Officers and higher command ranks only. An Admin appointment alone does not reveal the link.

- The HMAC token changes every UTC day.
- Command may revoke and regenerate it immediately.
- Links have configurable use limits.
- The form uses a honeypot and database-backed rate limiting.
- A submitted form creates a pending application only.
- Pending applicants cannot access the portal.
- Officers or authorised Admins approve, refuse or request more information.
- Approved applicants start as Enlisted and may enter a configurable probation period.

Required environment variable:

```env
PRIVATE_SIGNUP_SECRET=replace-with-at-least-32-random-characters
```

Changing this secret invalidates existing private application tokens.

## Automatic Star Citizen data

The importer is designed to populate member-facing data for the configured LIVE patch from:

- Star Citizen Wiki game data
- UEX API 2.0
- Free Navy member discoveries and corrections

Imported categories include, where a source exposes them:

- Blueprints and required materials
- Ships and vehicles
- Components, weapons, armour and equipment
- Commodities and raw materials
- Systems, planets, moons, cities, stations, outposts and points of interest
- Shops and terminals
- Purchase and rental locations and prices
- Refinery methods, yields and capacities
- Fuel prices

Checks performed before publication:

- Reject PTU, EPTU and Evocati data
- Require the configured LIVE version where a source exposes a version
- Verify required identifiers and names
- Use unique source keys to prevent duplicate imports
- Retain raw source payloads and attribution
- Protect the existing dataset when a source returns zero records
- Preserve previous member-facing data when an import fails
- Keep officer corrections and mark source conflicts instead of silently overwriting trusted corrections

Records that pass checks publish immediately. Officers and higher can edit them. Members can flag them as inaccurate and explain why.

## Watchlists and patch verification

Members may watch imported records. When a watched source record changes, the portal creates a notification.

When the official LIVE patch changes, the portal:

- Preserves existing information
- Marks patch-sensitive records for reconfirmation
- Creates verification tasks
- Allows members to claim and complete tasks with evidence
- Awards configured points after completion

## Import controls

The LIVE Source Control page provides:

- Sync all sources
- Sync Wiki only
- Sync UEX only
- Dry-run imports
- Pause or disable a source
- Health counters and recent failures
- Received, published and rejected record counts
- Pre-import backups
- Automatic scheduled imports
- Roll-forward protection if a source is empty or offline

## High-value action protection

Configurable thresholds are stored in Site Settings:

- Warehouse value requiring two authorised approvals
- Points adjustment requiring a second authorised Treasurer or executive

The second approver must be a different user and must possess the capability required by the request.

## Backups

The separate JSON Backup page supports:

- Manual backups
- Daily backups
- Weekly backups
- Pre-import backups
- Download and preview
- Retention cleanup
- President-only complete restoration
- President-only deletion

Passwords, Identity secrets and environment variables are not included in backups.

# Redeployment

## 1. Upload the package to GitHub

Replace the repository contents with this package. Keep the migrations in order:

```text
netlify/database/migrations/0001_free_navy_core.sql
netlify/database/migrations/0002_admin_console.sql
netlify/database/migrations/0003_command_ranks_imports.sql
netlify/database/migrations/0004_governance_operations.sql
netlify/database/migrations/0005_import_corrections.sql
```

Do not delete older migration files. Netlify applies new migrations in sequence.

## 2. Import environment variables in Netlify

```env
BOOTSTRAP_OWNER_EMAIL=your-email@example.com
STAR_CITIZEN_BASELINE_VERSION=4.8.2-LIVE.12030094
RSI_LIVE_PATCH_URL=
UEX_API_TOKEN=
UEX_CLIENT_VERSION=free-navy-4.0
PRIVATE_SIGNUP_SECRET=replace-with-at-least-32-random-characters
```

Notes:

- `BOOTSTRAP_OWNER_EMAIL` may be removed after your President account is confirmed.
- `UEX_API_TOKEN` is optional for public UEX resources, but recommended for stable identification and any endpoints that require an authenticated application.
- Netlify provides its database connection variables automatically.
- Do not commit a real `.env` file to GitHub.

## 3. Deploy

Use:

**Deploys → Trigger deploy → Clear cache and deploy site**

The build command is read from `netlify.toml`:

```text
npm run build
```

## 4. Sign out and back in

After the production migration completes, sign out and back in so Identity and the portal refresh rank, appointments, capabilities and session version.

## 5. Initial checks

Confirm:

1. The President can open Admin & Command and JSON Backup.
2. Member Directory shows the current private signup link.
3. The permission matrix loads.
4. Departments and Organisation Chart load.
5. LIVE Source Control displays Wiki and UEX sources.
6. A dry-run import records a run without publishing records.
7. A normal import creates a pre-import backup.
8. An Enlisted test account can flag data but cannot edit it.
9. Officer + Quartermaster can edit game data and warehouse stock but cannot edit treasury.
10. Treasurer can manage treasury but not warehouse unless also Quartermaster.

## Commands for local validation

```bash
npm install
npm run check
npm run build
npm audit --omit=dev
```

## Important security behaviour

- Sensitive changes are enforced inside Netlify Functions, not by hidden buttons alone.
- Identity roles are synchronised from the portal rank and appointments.
- Suspended and removed members have their session version incremented.
- Daily application links never grant portal access directly.
- Full backup restoration is hard-locked to the President.
- Discord integrations default to off and can only be enabled from Admin after the required Netlify environment variables are present.

## Free Navy 4.8.2 baseline and Discord patch

- GitHub is the source of truth and Netlify performs the build, Functions, Identity and Database deployment.
- The seed dataset is **4.8.2-LIVE.12030094**, displayed as baseline patch **4.8.2**.
- Ships, ground vehicles, blueprints and blueprint materials import from the Star Citizen Wiki API.
- The official RSI LIVE patch and each third-party source advance independently.
- The Game Data Library and LIVE verification controls are Admin-only.
- The missing `material_name` campaign column is repaired.
- Discord OAuth linking and webhooks are installed but switched off by default.
- Discord secrets are stored only in Netlify environment variables.
- This project is still in setup/testing, so imported test data may be reset from the Admin game-data page.

See `PATCH-README.md` and `NETLIFY-ENVIRONMENT.md` for deployment steps.
