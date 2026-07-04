# Free Navy deployment checklist

## GitHub

- [ ] Extract the ZIP.
- [ ] Upload all files except `node_modules`.
- [ ] Confirm migrations `0006` and `0007` are present.
- [ ] Commit and push to the branch connected to Netlify.

## Netlify

- [ ] Add the variables from `NETLIFY-ENVIRONMENT.md`.
- [ ] Confirm Node 20 is selected.
- [ ] Trigger **Clear cache and deploy site**.
- [ ] Confirm the build command is `npm run build`.
- [ ] Confirm the publish directory is `.`.

## First login

- [ ] Sign out and back in.
- [ ] Open **Game Data & LIVE Verification**.
- [ ] Import the 4.8.2 baseline.
- [ ] Confirm ship, vehicle and blueprint counts are above zero.
- [ ] Check the official LIVE patch.
- [ ] Test one normal feature switch.
- [ ] Confirm Discord shows **Setup required** and stays disabled.
