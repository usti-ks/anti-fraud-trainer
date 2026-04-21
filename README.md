# Anti-fraud trainer

Safe GigaChat setup is included.

## Put the key here

Create `.env.local` in the project root:

```env
GIGACHAT_AUTH_KEY=YOUR_REAL_GIGACHAT_AUTH_KEY
GIGACHAT_PORT=8787
```

## Run

```bash
npm install
npm run dev:full
```

## Notes

- Frontend calls only `/api/gigachat`
- Secret key is read only on the server from `process.env.GIGACHAT_AUTH_KEY`
- Do not publish `.env.local`
- GitHub Pages cannot run the secure proxy; use a Node-capable host for production


## Important

The proxy loads `.env.local` automatically via `dotenv`, so you do not need to export variables manually during local development.
