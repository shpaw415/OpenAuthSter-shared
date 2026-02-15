# OpenAuthster Shared Types & Client

Shared TypeScript types, database schemas, and client SDK used across the OpenAuthster stack.

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
| `subject`      | `SubjectSchema`    | No       | Custom subject schema for token verification – **server-side only**         |

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

#### Manual Callback Handling

The `init()` method automatically handles OAuth callbacks, but you can manually trigger the callback exchange if needed:

```typescript
await client.callback();
// Exchanges the authorization code for tokens
// Cleans up the URL query parameters (code, state)
// Sets isAuthenticated to true on success
```

### Checking Auth State

```typescript
client.isAuthenticated; // boolean – true once tokens are obtained
client.isLoaded; // boolean – true once init() has completed
client.expiresIn; // number | undefined – seconds until the access token expires

client.userMeta;
// { user_id: string | null, user_identifier: string | null }

client.userInfo;
// User info data returned by the OAuth provider (e.g., { provider: "google" })
// Available after successful authentication

client.error;
// { error: string, error_description: string | null } | null
// Contains error information from the authorization callback if login failed
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

### Token Management

#### Getting the Current Token

```typescript
const token = client.getToken();
// Returns the current access token or retrieves it from localStorage
```

#### Setting Token to Cookie

```typescript
client.setTokenToCookie();
// Stores the token in a cookie for persistence (browser-side only)
// Cookie is set as: access_token=<token>; path=/; secure; samesite=strict;
```

#### Token Verification

Verify a token's authenticity using the client's subject schema:

```typescript
// Verify the current client token
const isValid = await client.verify();
console.log(isValid); // true or false

// Verify a specific token
const isTokenValid = await client.verify("eyJhbGciOiJIUzI1NiIs...");
```

Token verification uses the subject schema provided during client initialization (or the default OpenAuthster schema). Failed verification logs an error and returns `false`.

### User Management (Admin Features)

These methods require the `secret` to be configured and are intended for server-side admin operations.

#### Get User by ID

```typescript
const user = await client.getUserById("user_12345");
if (user instanceof Error) {
  console.error("Failed to fetch user:", user.message);
} else {
  console.log(user);
}
```

#### Get Users List

Fetch a paginated list of users:

```typescript
const users = await client.getUsers({
  page: 1,
  limit: 10,
});

if (users instanceof Error) {
  console.error("Failed to fetch users:", users.message);
} else {
  console.log(users.data); // Array of users
  console.log(users.pagination); // Page info
}
```

#### Update User by ID

> Note this will overwrite the field it modify and does not merge.

```typescript
const result = await client.updateUserById("user_12345", {
  public_session: { theme: "dark" },
  private_session: { role: "admin" },
});

if (result instanceof Error) {
  console.error("Failed to update user:", result.message);
} else {
  console.log("User updated:", result);
}
```

#### Delete User by ID

```typescript
const result = await client.deleteUserById("user_12345");
if (!result.success) {
  console.error("Failed to delete user:", result.error);
} else {
  console.log("User deleted successfully");
}
```

### Auto Token Refresh

The client automatically schedules a token refresh 60 seconds before expiry. When tokens are refreshed, the new values are persisted to `localStorage`. No manual intervention is needed.

### Listening for State Changes

Register a callback that fires whenever `init()` completes or `triggerUpdate()` is called. The callback receives the client instance and an optional error object:

```typescript
client.addInitializationListener("my-key", (client, error) => {
  if (error) {
    console.error("Auth error:", error.error, error.error_description);
    return;
  }
  console.log("Auth state changed:", client.isAuthenticated);
});

// Manually trigger all listeners (e.g. after updating session data):
await client.triggerUpdate();
```

The error parameter is populated when the OAuth flow returns an error (e.g., user denied access, invalid request).

### Updating the Copy Template at Runtime

```typescript
client.updateOptions({ copyID: "fr-fr" });
```

This recreates the internal OpenAuth client with the new copy template.

### Custom Subject Schema (Server-Side)

For server-side token verification, you can provide a custom subject schema to validate incoming tokens. This is especially useful when using `setTokenFromRequest()` to ensure tokens conform to your expected format:

```typescript
import { createSubjects } from "@openauthjs/openauth/subject";
import * as v from "valibot";

const mySubjectSchema = createSubjects({
  user: v.object({
    id: v.string(),
    email: v.string(),
    role: v.union([v.literal("admin"), v.literal("user")]),
  }),
});

const client = createOpenAuthsterClient({
  clientID: "my_project_01",
  issuerURI: "https://auth.yourdomain.com",
  redirectURI: "https://myapp.com/",
  secret: process.env.AUTH_SECRET,
  subject: mySubjectSchema, // Custom schema for validation
});

// When setTokenFromRequest is called, the token will be verified against this schema
await client.setTokenFromRequest(request);
```

If no subject schema is provided, the default OpenAuthster schema is used.

---

## Server-Side Usage

On the server (API routes, Cloudflare Workers, etc.), you can still use `createOpenAuthsterClient` with a pre-set token from the request:

```typescript
import { createOpenAuthsterClient } from "openauthster-shared/client/user";
import { createSubjects } from "@openauthjs/openauth/subject";
import * as v from "valibot";

// Optional: Define a custom subject schema for token verification
const mySubjectSchema = createSubjects({
  user: v.object({
    id: v.string(),
    data: v.any(),
    clientID: v.string(),
    provider: v.string(),
  }),
});

export async function handleRequest(request: Request) {
  const client = createOpenAuthsterClient({
    clientID: "my_project_01",
    issuerURI: "https://auth.yourdomain.com",
    redirectURI: "https://myapp.com/",
    copyID: null,
    secret: process.env.AUTH_SECRET,
    subject: mySubjectSchema, // Optional: for token verification
  });

  // Extract and verify the Bearer token from the incoming request ( Headers or Cookies )
  await client.setTokenFromRequest(request);

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

| Method                          | Description                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `setTokenFromRequest(request)`  | Reads `Authorization: Bearer …` (or cookie), verifies and sets the client's token |
| `getTokenFromRequest(request)`  | Returns the bearer token string (or `null`) without setting it                    |
| `verify(token?)`                | Verifies token authenticity using the subject schema; returns `true` if valid     |
| `getUserById(user_id)`          | Fetches a user by ID (requires `secret`)                                          |
| `getUsers(filters?)`            | Fetches paginated list of users (requires `secret`)                               |
| `updateUserById(user_id, data)` | Updates a user by ID (requires `secret`)                                          |
| `deleteUserById(user_id)`       | Deletes a user by ID (requires `secret`)                                          |

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
