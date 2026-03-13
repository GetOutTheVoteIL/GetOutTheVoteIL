# GetOutTheVoteIL

Time-aware IL-9 vote challenge built with React and Vite.

The site is designed for mobile-first voter outreach. It changes its messaging based on Chicago time, points users to official Chicago, suburban Cook, and Lake County election resources.

## Highlights

- Time-aware states for early voting, Election Day, and post-close info mode
- Official voter-information links for Chicago, suburban Cook, and Lake County
- Device-aware sharing with Web Share, Text, WhatsApp, Facebook, Instagram, and copy flows
- Optional photo sharing for voting photos, sticker photos, or thumbs-up selfies
- Local-only contact picking for Text and WhatsApp
- No backend required

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
npm run preview
```

## GitHub Pages

Pushes to `main` build and deploy the site through GitHub Actions Pages.
If Pages is still pointed at a branch in repo settings, switch it to `GitHub Actions`.

## Notes

- Election timing is currently configured for the March 17, 2026 Illinois General Primary.
- The active election configuration lives in `src/lib/election.js`.
- Contact normalization, masking, and clipboard helpers live in `src/lib/relay.js`.
