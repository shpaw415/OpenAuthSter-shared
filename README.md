# OpenAuthster Shared Types & Client

Shared TypeScript types, database schemas, provider definitions, and client SDK used across the OpenAuthster stack.

## What's Inside

- **TypeScript types** - Shared domain types and endpoint contracts
- **Database schemas** - Drizzle ORM schemas and helpers for the issuer's D1 database
- **Low-level client** (`openauthster-shared/client`) - Thin wrapper around `@kagii/openauth` that injects `client_id`, optional `copy_id`, and the cookie expected by the issuer
- **OpenAuthsterClient** (`openauthster-shared/client/user`) - High-level client class for login, callback handling, token storage, refresh, session management, admin helpers, MFA, and passkey flows
- **Webhook helpers** (`openauthster-shared/webhook`) - Typed webhook payload verification helpers and webhook event definitions

## Installation

### Local Development

This package is used directly inside the OpenAuthster workspace.

```bash
# Clone the OpenAuthster workspace
git clone https://github.com/shpaw415/openauthster-workspace
cd openauthster-workspace

# The shared package is then available to the other workspace projects
```

### Package Managers

The published package name is `openauthster-shared`.

The repository version is currently `v1.0.0`. If the npm registry has not caught up yet, consume this package from the workspace sources until the published package is updated.

```bash
# npm
npm install openauthster-shared

# Bun
bun add openauthster-shared

# Yarn
yarn add openauthster-shared
```

---

## OpenAuthsterClient

`OpenAuthsterClient` is the recommended high-level client for applications. It handles login redirects, token exchange, automatic token refresh, public and private sessions, authenticated fetch calls, and several admin-oriented helpers.

Import it from `openauthster-shared/client/user`:

```typescript
import { createOpenAuthsterClient } from "openauthster-shared/client/user";
```

### Creating a Client

```typescript
const client = createOpenAuthsterClient({
  clientID: "my_project_01",
  issuerURI: "https://auth.yourdomain.com",
  redirectURI: "https://myapp.com/",
  secret: process.env.AUTH_SECRET,
});
```

| Option | Type | Required | Description |
| ------ | ---- | -------- | ----------- |
| `clientID` | `string` | Yes | Project identifier from the WebUI. |
| `issuerURI` | `string` | Yes | Base URL of the OpenAuthster issuer. Must start with `http` or `https`. |
| `redirectURI` | `string` | Yes | URL the issuer redirects back to after login. |
| `secret` | `string` | No | Server-side only. Used for private-session and admin requests that require signed headers. |
| `token` | `string` \| `null` | No | Pre-existing access token for server-side or restored-client scenarios. |
| `refreshToken` | `string` \| `null` | No | Pre-existing refresh token. |
| `subject` | `SubjectSchema` | No | Custom subject schema used when verifying tokens. |
| `authFlowCallbacks` | `Partial<{ onQRAuthFlowStart; onLoginRequired }>` | No | Optional callbacks for QR auth gating and refresh-failure handling. |
| `onError` | `(err: ErrorList) => void` | No | Optional error callback used by client helpers such as TOTP flows. |
| `cache_provider` | `{ get; set; delete }` | No | Optional async cache for token-derived user metadata. |

### Initialization

Call `init()` once in the browser after creating the client. It checks for OAuth callback parameters, exchanges tokens when needed, restores persisted tokens from `localStorage`, and notifies registered listeners.

```typescript
await client.init();
```

`init()` also fires every listener registered with `addInitializationListener`, so the UI can re-render when auth state changes.

### Login and Logout

```typescript
// Redirect the user to the issuer login page
await client.login();

// Or get the URL without navigating yet
const authURL = await client.login({ autoNavigate: false });

// Clear tokens, session data, and auth state
await client.logout();
```

`login()` stores the PKCE challenge in `localStorage`. When the user returns, `init()` detects the callback automatically. You can also call `callback()` yourself if you want to handle that step manually.

#### Manual Callback Handling

The `init()` method automatically handles OAuth callbacks, but you can manually trigger the callback exchange if needed:

```typescript
await client.callback();
```

On success, the client exchanges the authorization code for tokens, stores them locally, and removes `code` and `state` from the URL.

### Checking Auth State

```typescript
client.isAuthenticated; // boolean
client.isLoaded; // boolean
client.expiresAt; // Date | null

client.userMeta;
// { id: string | null, identifier: string | null, role: string | null, data: Record<string, unknown> | null }

client.userInfo;
// Provider-backed info loaded from /session responses.
// Includes at least { provider, role } and may include provider-specific fields and email.

client.error;
// { error: string, error_description: string | null } | null
```

### Lightweight Metadata

If you only need token-derived user metadata without loading a session blob, use `getMetaData()`:

```typescript
const meta = await client.getMetaData();
// { id, identifier, role, data } | null
```

### Public & Private Sessions

OpenAuthster stores two session buckets per user:

- **Public** - Readable from browser or server contexts.
- **Private** - Intended for server-side use and requires `secret` on requests.

#### Reading a Session

```typescript
const result = await client.getUserSession("public");

if (!(result instanceof Error)) {
  console.log(result.public);
  console.log(client.user_id);
  console.log(client.userInfo?.google?.picture); // with provider google
}
```

#### Updating a Session

`updateUserSession()` uses PATCH-style semantics. Only the provided keys are sent.

```typescript
await client.updateUserSession("public", {
  displayName: "Alice",
  theme: "dark",
});

// For private sessions (server-side, requires secret):
await client.updateUserSession("private", {
  api_key: "user-api-key",
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

Use `client.fetch()` for authenticated calls that should send the current bearer token.

- Adds `Authorization: Bearer <token>` when a token is present.
- Adds `X-Client-Timestamp` and `X-Client-Signature` when `secret` is configured.
- Does **not** append `client_id` automatically.

If you need the client to append `client_id`, use `client.fetchWithOptions()`.

```typescript
const response = await client.fetch("/api/v1/profile");
const data = await response.json();
```

### Token Management

#### Getting the Current Token

```typescript
const token = client.getToken();
// Returns the current access token or retrieves it from localStorage
```

#### Setting Token to Cookie

```typescript
client.setTokenToCookie();
// access_token=<token>; path=/; secure; samesite=lax;
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

`verify()` returns `true` or `false`. If no token is available and no explicit token is provided, it rejects.

### User Management (Admin Features)

These helpers are intended for server-side admin operations and typically require `secret` to be configured.

#### Get User by ID

```typescript
const user = await client.getUserById("user_12345");

if (user instanceof Error) {
  console.error("Failed to fetch user:", user.message);
} else {
  console.log(user.data.users[0]);
}
```

#### Get Many Users by ID

```typescript
const users = await client.getManyUserById(["user_1", "user_2"]);

if (users instanceof Error) {
  console.error("Failed to fetch users:", users.message);
} else {
  console.log(users.data.users);
}
```

#### Get Users List

```typescript
const users = await client.getUsers({
  page: 1,
  limit: 10,
});

if (users instanceof Error) {
  console.error("Failed to fetch users:", users.message);
} else {
  console.log(users.data.users);
  console.log(users.data.total);
}
```

#### Update User by ID

Only the provided fields are updated. Omitted fields are left unchanged.

```typescript
const result = await client.updateUserById("user_12345", {
  session_public: { theme: "dark" },
  session_private: { role: "admin" },
});

if (result instanceof Error) {
  console.error("Failed to update user:", result.message);
} else {
  console.log("User updated:", result);
}
```

#### Update User Role by ID

```typescript
const result = await client.setUserRoleById("user_12345", "admin");

if (result instanceof Error) {
  console.error("Failed to update user role:", result.message);
} else {
  console.log("Updated role:", result);
}
```

#### Delete User by ID

```typescript
const result = await client.deleteUserById("user_12345");

if (!result.success) {
  console.error("Failed to delete user:", result.error);
}
```

#### Delete the Current User

```typescript
const result = await client.deleteCurrentUser();

if (!result.success) {
  console.error("Failed to delete current user:", result.error);
}
```

On success, `deleteCurrentUser()` also clears the local authentication state.

### Auto Token Refresh

The client stores the issuer-provided token expiry time, schedules a refresh for that expiry point, and also attempts a refresh if an authenticated request detects that the token is already expired.

Refresh attempts retry up to three times with backoff. If they still fail, the client either calls `authFlowCallbacks.onLoginRequired` or logs the user out.

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
client.removeInitializationListener("my-key");
```

The error parameter is populated when the OAuth flow returns an error (e.g., user denied access, invalid request).

### Updating Runtime Options

```typescript
client.updateOptions({ copyID: "fr-fr" });
client.updateOptions({ secret: process.env.AUTH_SECRET });
```

Updating `copyID` recreates the internal OpenAuth client so future login flows use the new template.

### MFA and Passkey Helpers

The high-level client also exposes helper objects for TOTP and passkey flows.

```typescript
const setup = await client.mfa.totpClient.setupTotp();
const elevated = await client.mfa.totpClient.getElevatedToken("123456");

await client.passkey.login();
await client.passkey.register({ userDisplayName: "Alice" });
```

Useful helper methods include:

- `client.mfa.totpClient.setupTotp()`
- `client.mfa.totpClient.confirmSetup({ code })`
- `client.mfa.totpClient.getElevatedToken(code)`
- `client.mfa.totpClient.removeMFAWithBackupCode(code)`
- `client.passkey.login()`
- `client.passkey.register({ userDisplayName })`

### Custom Subject Schema (Server-Side)

For server-side token verification, you can provide a custom subject schema to `createOpenAuthsterClient`.

```typescript
import { createSubjects } from "@kagii/openauth/subject";
import * as v from "valibot";

const mySubjectSchema = createSubjects({
  user: v.object({
    id: v.string(),
    identifier: v.string(),
    role: v.nullable(v.string()),
    data: v.looseObject({}),
    clientID: v.string(),
    provider: v.string(),
  }),
});

const client = createOpenAuthsterClient({
  clientID: "my_project_01",
  issuerURI: "https://auth.yourdomain.com",
  redirectURI: "https://myapp.com/",
  secret: process.env.AUTH_SECRET,
  subject: mySubjectSchema,
});

await client.setTokenFromRequest(request);
```

If no subject schema is provided, the default OpenAuthster schema is used.

---

## Server-Side Usage

On the server (API routes, Cloudflare Workers, etc.), you can still use `createOpenAuthsterClient` with a pre-set token from the request:

```typescript
import { createOpenAuthsterClient } from "openauthster-shared/client/user";
import { createSubjects } from "@kagii/openauth/subject";
import * as v from "valibot";

const mySubjectSchema = createSubjects({
  user: v.object({
    id: v.string(),
    identifier: v.string(),
    role: v.nullable(v.string()),
    data: v.looseObject({}),
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
    subject: mySubjectSchema,
  });

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
| `getMetaData()`                 | Returns lightweight token-derived user metadata without loading session data       |
| `getUserById(user_id)`          | Fetches a user by ID                                                              |
| `getManyUserById(ids)`          | Fetches several users in a single request                                         |
| `getUsers(filters?)`            | Fetches a user list and total count                                               |
| `updateUserById(user_id, data)` | Updates selected user fields                                                      |
| `setUserRoleById(user_id, role)` | Updates only the user's role                                                     |
| `deleteUserById(user_id)`       | Deletes a user by ID                                                              |
| `deleteCurrentUser()`           | Deletes the currently authenticated user and clears local auth state              |

---

## Webhooks

Use the webhook helpers from `openauthster-shared/webhook` to verify incoming webhook requests from an OpenAuthster issuer and parse them into strongly typed payloads.

```typescript
import { WebHook } from "openauthster-shared/webhook";
```

### Handling an Incoming Webhook

This is the main integration point for applications receiving OpenAuthster webhook events:

```typescript
import { WebHook } from "openauthster-shared/webhook";

export async function GET(request: Request) {
  const data = await WebHook.getWebHookPayloadFromRequest(
    "login_success",
    request,
    process.env.AUTH_SECRET as string,
  );

  console.log("webhook data", data);
  return new Response("ok");
}
```

`getWebHookPayloadFromRequest()` does all of the verification work for you:

- Reads the payload from the `payload` query parameter for `GET` requests.
- Reads the raw request body for non-`GET` requests such as `POST`.
- Verifies the signature header using your app secret.
- Rejects payloads older than 5 minutes to reduce replay risk.
- Returns a typed payload matched to the event you requested.

If signature verification fails, or the timestamp is too old, it throws `WebHookUnAuthorizedError`.

### Payload Shape

All webhook payloads follow this envelope:

```typescript
type WebHookPayLoad<Event extends WebHookEvents, Data> = {
  event: Event;
  clientID: string;
  timestamp: string;
  id: string;
  data: Data;
  meta: {
    ip: string;
    userAgent: string;
  };
};
```

Example `login_success` payload:

```json
{
  "event": "login_success",
  "clientID": "__my_project_xyz",
  "timestamp": "2026-04-02T12:00:00.000Z",
  "id": "webhook_uuid",
  "data": {
    "userID": "user_123",
    "provider": "google"
  },
  "meta": {
    "ip": "203.0.113.10",
    "userAgent": "Mozilla/5.0"
  }
}
```

### Supported Events

The shared package currently defines these webhook events:

- `registration_success`
- `login_success`
- `code_sent`
- `mfa_setup`
- `mfa_update`
- `mfa_confirmed`
- `mfa_removed`

The event-specific `data` payloads are:

- `registration_success`: `{ userID, provider }`
- `login_success`: `{ userID, provider }`
- `code_sent`: `{ code, method, send_to, provider }`
- `mfa_setup`: `{ userID }`
- `mfa_update`: `{ userID, method: "backup_code" }`
- `mfa_confirmed`: `{ userID }`
- `mfa_removed`: `{ userID, method: "token" | "backup_code" }`

If you want the payload types directly, import them from `openauthster-shared/webhook/types`:

```typescript
import type {
  WebHookEvents,
  WebHookPayLoad,
  WebHookPayloadLoginSuccess,
  WebHookPayloadRegistrationSuccess,
} from "openauthster-shared/webhook/types";
```

### Delivery Format

When OpenAuthster triggers a webhook:

- `GET` webhooks receive the serialized payload in the `payload` query parameter.
- `POST` webhooks receive the serialized payload as the request body.

Your receiving endpoint should always pass the original `Request` object directly to `WebHook.getWebHookPayloadFromRequest(...)` so the signature is verified against the unmodified payload.

### Notes

- Use the same app secret on the receiver that the issuer uses to sign webhook payloads.
- The helper is intended for webhook consumers. Webhook registration and triggering are internal issuer-side capabilities.
- If you need event names for UI or validation, `WebHookEventsList` and `WebHookEventsDetails` are exported from `openauthster-shared/webhook/types`.

---

## Low-Level Client (`openauthster-shared/client`)

If you only need a raw `@kagii/openauth` client with OpenAuthster request defaults, use the low-level helpers:

```typescript
import { createClient, createServerClient } from "openauthster-shared/client";

// Browser / Edge
const client = createClient({
  clientID: "my_project_01",
  issuer: "https://auth.yourdomain.com",
  copyID: "en-us", // or null
});

// Server-side
const serverClient = createServerClient({
  clientID: "my_project_01",
  issuer: "https://auth.yourdomain.com",
  request,
});
```

`createServerClient()` resolves `client_id` and `copy_id` from the request query string when present, then falls back to the explicit options you passed.

These helpers return the raw OpenAuth client. You are responsible for token storage, refresh, and higher-level session management yourself.

---

## React Integration Example

See the [openauth-react](https://github.com/shpaw415/openauth-react) package for a higher-level React integration. Here's a minimal example:

```tsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  createOpenAuthsterClient,
  type OpenAuthsterClient,
} from "openauthster-shared/client/user";

// Create a context (use a global to survive HMR / StrictMode)
declare global {
  var __AUTH_CTX__: React.Context<OpenAuthsterClient<any, any, string, any>>;
}
globalThis.__AUTH_CTX__ ??= createContext(
  {} as OpenAuthsterClient<any, any, string, any>,
);

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
    void client.current.init().then(async () => {
      if (client.current.isAuthenticated) {
        await client.current.getUserSession("public");
      }
      await client.current.triggerUpdate();
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
  const [, rerender] = useState(0);

  useEffect(() => {
    ctx.addInitializationListener(key.current, () => {
      rerender((value) => value + 1);
    });

    return () => {
      ctx.removeInitializationListener(key.current);
    };
  }, [ctx]);

  return ctx;
}
```

Then in a component:

```tsx
function HomePage() {
  const auth = useAuth();

  if (!auth.isLoaded) return <p>Loading...</p>;

  return auth.isAuthenticated ? (
    <div>
      <p>Welcome, {auth.userMeta.identifier}</p>
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

```text
openauthster-shared/          # workspace folder: openauth-webui-shared-types
├── index.ts                  # Main exports, provider registry, shared types, constants
├── utils.ts                  # Cookie and request helpers
├── client/
│   ├── index.ts              # Low-level createClient / createServerClient helpers
│   ├── user.ts               # OpenAuthsterClient + createOpenAuthsterClient
│   └── mfa/                  # TOTP helpers used by the high-level client
├── client/passkey.ts         # Passkey helper used by the high-level client
├── database/
│   ├── drizzle.ts            # Drizzle exports and query helpers
│   ├── schema.ts             # Shared database schemas and table helpers
│   ├── endpoints.ts          # Shared endpoint response and filter types
│   └── delete-user.ts        # Shared delete-user cleanup helper
├── providers/                # Provider definitions and custom provider helpers
├── webhook/                  # Webhook helpers and types
└── security/                 # Shared security utilities
```

## Related Repositories

- [OpenAuthster](https://github.com/shpaw415/openauthster) – Main project documentation
- [OpenAuthster Issuer](https://github.com/shpaw415/OpenAuthSter-issuer) – Cloudflare Worker issuer
- [OpenAuthster WebUI](https://github.com/shpaw415/OpenAuthSter-webUI) – Management dashboard
- [React SDK](https://github.com/shpaw415/openauth-react) – React integration (WIP)

## License

License information coming soon.
