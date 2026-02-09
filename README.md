# OpenAuthster Shared Types & Client

Shared TypeScript types, database schemas, and client SDK used across the OpenAuthster stack.

> **📦 Package Status:** This package is currently for local development use within the OpenAuthster mono-repo workspace. Public npm package publication is planned for future releases.

## What's Inside

- **TypeScript types** – Shared domain types and endpoint contracts
- **Database schemas** – Drizzle ORM schemas for the issuer's D1 database
- **Low-level client** (`openauthster-shared/client`) – Thin wrapper around `@openauthjs/openauth` that sets cookies the issuer expects
- **OpenAuthsterClient** (`openauthster-shared/client/user`) – High-level client class that manages the full auth lifecycle (login, tokens, sessions, auto-refresh)

## Installation

### For Local Development (Current)

This package is currently used within the OpenAuthster mono-repo workspace. When developing locally:

```bash
# Clone the OpenAuthster workspace
git clone https://github.com/shpaw415/openauthster-workspace
cd openauthster-workspace

# The shared types are available to other workspace projects
```

### For Production Use (Coming Soon)

```bash
# npm (not yet published)
npm install openauthster-shared

# Bun (not yet published)
bun add openauthster-shared

# Yarn (not yet published)
yarn add openauthster-shared
```

---

## OpenAuthsterClient (recommended)

`OpenAuthsterClient` is the high-level client you should use in your apps. It handles login redirects, token exchange, automatic token refresh, public/private session management, and authenticated fetch calls.

Import it from `openauthster-shared/client/user`:

```typescript
import { createOpenAuthsterClient } from "openauthster-shared/client/user";
```

### Creating a Client

```typescript
const client = createOpenAuthsterClient({
  clientID: "my_project_01", // Project slug from the WebUI
  issuerURI: "https://auth.yourdomain.com", // Your OpenAuthster issuer URL
  redirectURI: "https://myapp.com/", // Where the issuer redirects after login
  copyID: "en-us", // Copy template ID for i18n (optional, null if unused)
  secret: process.env.AUTH_SECRET, // Server-side only – required for private session ops
});
```

| Option         | Type               | Required | Description                                                                 |
| -------------- | ------------------ | -------- | --------------------------------------------------------------------------- |
| `clientID`     | `string`           | Yes      | Project identifier from the WebUI                                           |
| `issuerURI`    | `string`           | Yes      | Base URL of the OpenAuthster issuer                                         |
| `redirectURI`  | `string`           | Yes      | URL the issuer sends the user back to after authentication                  |
| `copyID`       | `string` \| `null` | No       | Copy template ID for i18n support (e.g. `"en-us"`, `"fr-fr"`)               |
| `secret`       | `string`           | No       | Client secret – **server-side only**, needed for private session read/write |
| `token`        | `string` \| `null` | No       | Pre-existing access token (server-side scenarios)                           |
| `refreshToken` | `string` \| `null` | No       | Pre-existing refresh token                                                  |

### Initialization (Browser)

After creating the client, call `init()` once. This checks for an authorization code in the URL, exchanges it for tokens if present, and restores any stored tokens from `localStorage`.

```typescript
await client.init();
```

`init()` also fires every listener registered with `addInitializationListener`, so the UI can re-render when auth state changes.

### Login & Logout

```typescript
// Redirect the user to the issuer's login page
await client.login();

// Clear all tokens and session data
client.logout();
```

`login()` stores an OAuth PKCE challenge in `localStorage`, then sets `window.location.href` to the issuer. When the user comes back, `init()` picks up the `code` query parameter, exchanges it, and stores the tokens.

### Checking Auth State

```typescript
client.isAuthenticated; // boolean – true once tokens are obtained
client.isLoaded; // boolean – true once init() has completed
client.expiresIn; // number | undefined – seconds until the access token expires

client.userMeta;
// { user_id: string | null, user_identifier: string | null }
```

### Public & Private Sessions

OpenAuthster stores two session buckets per user: **public** (readable from the browser) and **private** (requires the `secret`, server-side only).

#### Reading a Session

```typescript
const result = await client.getUserSession("public");
// result is the session data or an Error

// After a successful call, data is also available on the client instance:
console.log(client.data.public);
console.log(client.userMeta.user_id);
```

#### Updating a Session

```typescript
await client.updateUserSession("public", {
  displayName: "Alice",
  theme: "dark",
});

// For private sessions (server-side, requires secret):
await client.updateUserSession("private", {
  internalRole: "admin",
});
```

#### Clearing a Session

```typescript
// Clear public session data
await client.clearPublicSession();

// Clear private session data (server-side, requires secret)
await client.clearPrivateSession();
```

### Authenticated Fetch

Use `client.fetch()` to make requests that automatically include the `Authorization: Bearer <token>` header (and the `X-Client-Secret` header when a secret is configured).

```typescript
const response = await client.fetch("/api/v1/profile");
const data = await response.json();
```

This is useful for calling your own server-side API routes that need to verify the user's token.

### Auto Token Refresh

The client automatically schedules a token refresh 60 seconds before expiry. When tokens are refreshed, the new values are persisted to `localStorage`. No manual intervention is needed.

### Listening for State Changes

Register a callback that fires whenever `init()` completes or `triggerUpdate()` is called:

```typescript
client.addInitializationListener("my-key", () => {
  console.log("Auth state changed:", client.isAuthenticated);
});

// Manually trigger all listeners (e.g. after updating session data):
client.triggerUpdate();
```

### Updating the Copy Template at Runtime

```typescript
client.updateOptions({ copyID: "fr-fr" });
```

This recreates the internal OpenAuth client with the new copy template.

---

## Server-Side Usage

On the server (API routes, Cloudflare Workers, etc.), you can still use `createOpenAuthsterClient` with a pre-set token from the request:

```typescript
import { createOpenAuthsterClient } from "openauthster-shared/client/user";

export async function handleRequest(request: Request) {
  const client = createOpenAuthsterClient({
    clientID: "my_project_01",
    issuerURI: "https://auth.yourdomain.com",
    redirectURI: "https://myapp.com/",
    copyID: null,
    secret: process.env.AUTH_SECRET,
  });

  // Extract the Bearer token from the incoming request
  client.setTokenFromRequest(request);

  if (!client.isAuthenticated) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Read the private session
  const session = await client.getUserSession("private");

  return new Response(JSON.stringify(session), {
    headers: { "Content-Type": "application/json" },
  });
}
```

### Server Helpers

| Method                         | Description                                                    |
| ------------------------------ | -------------------------------------------------------------- |
| `setTokenFromRequest(request)` | Reads `Authorization: Bearer …` and sets the client's token    |
| `getTokenFromRequest(request)` | Returns the bearer token string (or `null`) without setting it |

---

## Low-Level Client (`openauthster-shared/client`)

If you only need a raw `@openauthjs/openauth` client with OpenAuthster cookies, use the low-level helpers:

```typescript
import { createClient, createServerClient } from "openauthster-shared/client";

// Browser / Edge
const client = createClient({
  clientID: "my_project_01",
  issuer: "https://auth.yourdomain.com",
  copyID: "en-us", // or null
});

// Server-side (copies copyID from the request's client_id query param)
const serverClient = createServerClient({
  clientID: "my_project_01",
  issuer: "https://auth.yourdomain.com",
  request,
});
```

These return a raw OpenAuth `Client` — you handle tokens, storage, and refreshing yourself. For most apps, use `OpenAuthsterClient` instead.

---

## React Integration Example

See the [openauth-react](https://github.com/shpaw415/openauth-react) package (WIP) for a ready-made provider + hook. Here's a minimal example:

```tsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  createOpenAuthsterClient,
  type OpenAuthsterClient,
} from "openauthster-shared/client/user";

// Create a context (use a global to survive HMR / StrictMode)
declare global {
  var __AUTH_CTX__: React.Context<OpenAuthsterClient>;
}
globalThis.__AUTH_CTX__ ??= createContext({} as OpenAuthsterClient);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useRef(
    createOpenAuthsterClient({
      clientID: "my_project_01",
      issuerURI: "https://auth.yourdomain.com",
      redirectURI: "http://localhost:3000/",
      copyID: "en-us",
    }),
  );

  useEffect(() => {
    client.current.init().then(() => {
      client.current
        .getUserSession("public")
        .then(() => client.current.triggerUpdate());
    });
  }, []);

  return (
    <globalThis.__AUTH_CTX__.Provider value={client.current}>
      {children}
    </globalThis.__AUTH_CTX__.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(globalThis.__AUTH_CTX__);
  const key = useRef(crypto.randomUUID());
  const [, rerender] = useState("");

  useEffect(() =>
    ctx.addInitializationListener(key.current, () =>
      rerender(crypto.randomUUID()),
    ),
  );

  return ctx;
}
```

Then in a component:

```tsx
function HomePage() {
  const auth = useAuth();

  if (!auth.isLoaded) return <p>Loading…</p>;

  return auth.isAuthenticated ? (
    <div>
      <p>Welcome, {auth.userMeta.user_identifier}</p>
      <pre>{JSON.stringify(auth.data.public, null, 2)}</pre>
      <button onClick={() => auth.logout()}>Logout</button>
    </div>
  ) : (
    <button onClick={() => auth.login()}>Login</button>
  );
}
```

---

## Directory Map

```
openauthster-shared/          # (workspace: openauth-webui-shared-types)
├── index.ts                  # Main exports (types, constants, provider registry)
├── utils.ts                  # Cookie utilities
├── client/
│   ├── index.ts              # Low-level createClient / createServerClient
│   └── user.ts               # OpenAuthsterClient class + createOpenAuthsterClient
├── database/
│   ├── drizzle.ts            # Drizzle configuration
│   └── schema.ts             # Database schemas
└── endpoints/
    └── index.ts              # API endpoint types
```

## Related Repositories

- [OpenAuthster](https://github.com/shpaw415/openauthster) – Main project documentation
- [OpenAuthster Issuer](https://github.com/shpaw415/OpenAuthSter-issuer) – Cloudflare Worker issuer
- [OpenAuthster WebUI](https://github.com/shpaw415/OpenAuthSter-webUI) – Management dashboard
- [React SDK](https://github.com/shpaw415/openauth-react) – React integration (WIP)

## License

License information coming soon
