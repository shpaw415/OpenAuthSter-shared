# Changelog — openauthster-shared

## v0.3.1 — 2026-03-13

### Bug Fixes

#### Critical

- **Auto-refresh timer never fired** — `setTimeout` was passed a function that returned a bound reference instead of calling it, silently breaking token renewal for all users. (`client/user.ts`)

#### Security

- **Webhook ownership not enforced on `update` and `deleteWebHook`** — Both methods filtered only by webhook ID, allowing any authenticated project to modify or delete another project's webhooks. `clientID` ownership is now asserted in all WHERE clauses. (`webhook/index.ts`)
- **`getWebHooks` leaked cross-project configs when `filters.id` was supplied** — The `clientID` constraint was omitted when querying by specific webhook ID. Fixed to always include the `clientID` filter. (`webhook/index.ts`)
- **Access token cookie used `SameSite=Strict`** — After an OAuth redirect the browser suppressed the strict cookie, causing immediate session read failures. Changed to `SameSite=Lax`. (`client/user.ts`)
- **SQL injection guard added to dynamic table operations** — `clientID` is now validated against the allowed pattern at the top of both `createUserTable` and `DeleteOTFusersTable` before being interpolated into SQL. (`database/schema.ts`)

#### High

- **QR auth location lost when WebSocket disconnects** — If the PC browser tab was refreshed between QR scan and redirect, the OAuth location was permanently lost. It is now persisted to Durable Object storage and can be delivered on reconnect or surfaced as an error to the mobile client. (`providers/custom/DurableObject.ts`)
- **`QRauthFlowCallback` silently aborted when `onQRAuthFlowStart` was absent** — `!undefined` evaluated to `true`, causing the QR flow to return immediately without completing. Guard now only activates when the callback is explicitly provided. (`client/user.ts`)

#### Medium

- **Cookie values truncated on `=` characters** — `.split("=").at(1)` discarded everything after the first `=`, silently breaking Base64 and JWT cookie values. Fixed to use `slice(indexOf("=") + 1)`. (`client/user.ts`, `utils.ts`)
- **JWKS cache had no TTL** — `cachedJWKS` was held indefinitely in the Worker isolate, permanently breaking QR token verification after key rotation. Cache now expires after 1 hour. (`providers/custom/qr/index.ts`)
- **Valibot internal `~standard` API removed** — `schema["~standard"].validate(...)` was an unstable private interface. Replaced with `v.safeParse`. (`providers/custom/qr/index.ts`)

### New Features

- **`OpenAuthsterClient.getMetaData()`** — New async method that returns `{ id, identifier, provider }` for the currently authenticated user by verifying the token and extracting subject claims directly, without loading any session blob. Useful for lightweight presence checks in both browser and server environments. (`client/user.ts`)

### Code Quality

- **`InvalidRefreshTokenError` appeared twice in `ErrorList` union** — Duplicate entry removed. (`client/errors.ts`)
- **`hashWithSecretKey` double-serialization documented** — The undocumented behavior of `JSON.stringify`-wrapping string inputs before HMAC is now explicitly noted in the JSDoc to prevent signature mismatches in new callers. (`security/encryption.ts`)
- **Large commented-out OAuth passkey callback block removed** — ~70 lines of dead code have been deleted and the chosen custom redirect flow is now formally documented. (`providers/custom/passkey/`)
- **QR provider default copy strings changed from French to English** — `title: "Connexion par QR Code"` and related strings were the only French defaults in the codebase. All defaults are now English. (`providers/custom/qr/index.ts`)
