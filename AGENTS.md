# AGENTS.md

Wanderlast API: a single-file Express 5 (ESM) server in `index.js` using the native MongoDB driver, JWKS-based JWT auth, and Vercel for deployment.

## Commands

- `npm start` — runs `node index.js`; listens on `PORT` (default **5000**) and connects to MongoDB lazily on the first request.
- `npm run dev` — `nodemon index.js`, but **nodemon is not installed or declared** in `package.json`. Run `npx nodemon index.js` or install it first; don't assume `npm run dev` works after a fresh clone.
- No test, lint, typecheck, or build scripts exist. Verify changes by starting the server and calling routes with `curl` against `http://localhost:5000`.
- Deploy is Vercel via `vercel.json` (`@vercel/node`, all paths → `index.js`). `.vercel/` is linked but gitignored.

## Environment

- `.env` is gitignored and must define `MONGODB_URL` and `CLIENT_URL` (only these are currently used).
- `MONGODB_URL` must start with `mongodb://` or `mongodb+srv://`. The code trims whitespace and matching quotes, but rejects other malformed values; never log the value.
- `CLIENT_URL` is the frontend origin used for Better Auth's JWKS at `/api/auth/jwks`. It is normalized through `new URL('/api/auth/jwks', clientUrl.origin)`, so a trailing slash or path is harmless. Production requires `https`.
- Database name is hardcoded to `wanderlast`; collections are `destination` and `bookings`.

## Architecture and quirks

- `index.js` contains everything: `verifyToken` middleware, Mongo setup, and all routes. There is no `src/` or route-module split.
- Mongo connects lazily on the first request through a single cached `MongoClient` promise, `client.db('wanderlast')`. Failed connects clear the cache so a later request can retry. A missing/invalid `MONGODB_URL` yields `503 Database is unavailable`, not a module-load crash.
- `app.listen()` runs only when `process.env.VERCEL` is unset. Vercel imports the exported `app`; local `npm start` uses `PORT` if set, otherwise `5000`.
- Auth: `verifyToken` guards all writes, `GET /destination/:id`, and booking routes. `GET /destination` and `GET /my-bookings/:email` are unauthenticated. Authenticated claims are attached as `req.user`; there are no role/permission checks.
- Better Auth 1.7.14's JWT plugin issues EdDSA/Ed25519 tokens with issuer/audience set to its `baseURL` (`BETTER_AUTH_URL`). The backend pins `algorithms: ['EdDSA']` and does not validate issuer/audience, so a frontend `BETTER_AUTH_URL` mismatch does not invalidate tokens as long as the JWKS endpoint is reachable.
- JWKS/config failures return `503`; invalid or expired tokens return `401`. CORS is fully open (`app.use(cors())`).
- Booking `_id` values are mixed: bookings created from the client may inherit the destination's **string** id, while newer records use an `ObjectId`. `DELETE /bookings/:id` requires `?email=` and matches both representations — preserve this if you touch booking code.
- `DELETE /destination/:id` deletes by `_id`; destination and booking routes return `400` for malformed ObjectIds.
- Async route errors are caught by the final Express error handler, which returns a generic `500`.

## Repo hygiene

- `node_modules/` is **tracked in git** because `.gitignore` misspells `node_modules` as `node_module`. Never stage bulk `node_modules` changes, and don't delete tracked `node_modules` without confirming.
- No README exists. Treat `index.js`, `package.json`, and `vercel.json` as the source of truth over any prose.
