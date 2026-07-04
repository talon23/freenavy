# Netlify environment variables

Add variables under **Netlify → Project configuration → Environment variables**.
Do not commit real secret values to GitHub.

## Existing portal variables

```env
BOOTSTRAP_OWNER_EMAIL=talon2389@gmail.com
PRIVATE_SIGNUP_SECRET=replace-with-a-long-random-secret
UEX_API_TOKEN=
```

Remove `BOOTSTRAP_OWNER_EMAIL` after the President account is confirmed and working.

## 4.8.2 baseline importer

```env
STAR_CITIZEN_BASELINE_VERSION=4.8.2-LIVE.12030094
SCW_API_BASE=https://api.star-citizen.wiki/api
UEX_CLIENT_VERSION=free-navy-4.8.2-live-sync
```

## Official LIVE version check

The existing official RSI patch-note checker works without an override. These variables are optional fallbacks:

```env
STAR_CITIZEN_LIVE_VERSION=4.8.3
RSI_LIVE_PATCH_URL=
```

Only set `RSI_LIVE_PATCH_URL` when using a known official RSI patch-notes page.

## Discord account linking

Leave these blank until Discord is being integrated:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://YOUR-SITE.netlify.app/api/discord-auth-callback
```

The redirect URI must exactly match the Discord Developer Portal value.

## Optional Discord server membership check

```env
DISCORD_GUILD_ID=
DISCORD_BOT_TOKEN=
```

## Optional Discord webhook posting

```env
DISCORD_WEBHOOK_URL=
```

The Admin switch cannot enable a Discord function until its required variables are present. Secret values are read by Netlify Functions and are never displayed back in the portal.
