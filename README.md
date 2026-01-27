# OpenAuthster Shared Types

> 📦 Shared TypeScript types, database schemas, and client SDK for the OpenAuthster ecosystem

## Overview

This package provides the core building blocks used across the OpenAuthster project:

- 🔤 **TypeScript Types** - Shared type definitions for type-safe development
- 🗄️ **Database Schemas** - Drizzle ORM schemas for D1 database
- 🔌 **Client SDK** - Connect your applications to the OpenAuthster issuer
- 🛣️ **Endpoint Types** - API request/response type definitions

## Installation

```bash
# Using Bun
bun add openauthster-shared

# Using npm
npm install openauthster-shared

# Using yarn
yarn add openauthster-shared
```

## Client Usage

Connect your application to the OpenAuthster issuer:

### Basic Setup

```typescript
import { createClient, setOpenAuthOptions } from "openauthster-shared/client";

// Create the authentication client
export const client = createClient({
  clientID: "my_project_01", // Project name from the WebUI
  issuer: "https://auth.yourdomain.com", // Your OpenAuthster issuer URL
});

// Configure global options
setOpenAuthOptions({
  copyId: "en-us", // Copy template ID from WebUI (for i18n support)
});
```

### Authentication Flow

```typescript
import { client } from "./auth";

// Redirect to login
await client.authorize("code", {
  redirectUri: "https://myapp.com/callback",
});

// Handle callback and exchange code for tokens
const tokens = await client.exchange(code, redirectUri);
```

### Token Management

```typescript
// Refresh tokens
const newTokens = await client.refresh(tokens.refreshToken);

// Verify token
const isValid = await client.verify(tokens.accessToken);
```

## Package Exports

### `/client`

Client-side SDK for authentication:

```typescript
import { createClient, setOpenAuthOptions } from "openauthster-shared/client";
```

### `/database`

Drizzle ORM schemas and database utilities:

```typescript
import { schema } from "openauthster-shared/database";
```

### `/endpoints`

API endpoint type definitions:

```typescript
import type { EndpointTypes } from "openauthster-shared/endpoints";
```

## Project Structure

```
openauth-webui-shared-types/
├── index.ts          # Main exports
├── client/
│   └── index.ts      # Client SDK
├── database/
│   ├── drizzle.ts    # Drizzle configuration
│   └── schema.ts     # Database schemas
└── endpoints/
    └── index.ts      # API endpoint types
```

## Configuration Options

### `createClient` Options

| Option     | Type     | Description                            |
| ---------- | -------- | -------------------------------------- |
| `clientID` | `string` | Your project identifier from the WebUI |
| `issuer`   | `string` | The OpenAuthster issuer URL            |

### `setOpenAuthOptions` Options

| Option   | Type     | Description                                            |
| -------- | -------- | ------------------------------------------------------ |
| `copyId` | `string` | Copy template ID for i18n (e.g., `"en-us"`, `"fr-fr"`) |

## Related Repositories

- [OpenAuthster](https://github.com/shpaw415/openauthster) - Main project documentation
- [OpenAuthster Issuer](https://github.com/shpaw415/openauth-multi-tenant-server-provider) - Authentication server
- [OpenAuthster WebUI](https://github.com/shpaw415/openauth-webui) - Management dashboard
- [React SDK](https://github.com/shpaw415/openauth-react) - React integration (WIP)

## License

> License information coming soon
