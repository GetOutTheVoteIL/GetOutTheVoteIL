# GetOutTheVoteIL

Time-aware IL-9 voting relay built with React and Vite.

The site is designed for mobile-first voter outreach. It changes its messaging based on Chicago time, points users to official Chicago, suburban Cook, and Lake County election resources.

## Highlights

- Time-aware states for early voting, Election Day, and post-close info mode
- Official voter-information links for Chicago, suburban Cook, and Lake County
- Native mobile sharing with SMS, WhatsApp, copy, and Web Share support
- Optional photo sharing for voting photos, sticker photos, or thumbs-up selfies
- Local-only relay tracking using compact SHA-256-derived tokens in the URL
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

## Notes

- Election timing is currently configured for the March 17, 2026 Illinois General Primary.
- The active election configuration lives in `src/lib/election.js`.
- Contact normalization, token generation, and compact relay URL packing live in `src/lib/relay.js`.
