import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { drizzle } from "./drizzle";
import type { OTFUsersType, OTFUsersParsedType } from "./types";
export * from "./types";

export const reservedTableNames = [
  "openauth_webui_projects",
  "openauth_webui_email_templates",
  "openauth_webui",
  "openauth_webui_ui_styles",
  "openauth_webui_copy_templates",
  "openauth_webui_logs",
];

const ensureTableisValid = (name: string) => {
  if (reservedTableNames.includes(name))
    throw new Error("Table name is reserved");
  return name;
};

export function isClientIdValid(name: string) {
  // SQLite table name safe: must start with letter/underscore, only alphanumeric + underscore
  const regex = /^[a-zA-Z_][a-zA-Z0-9_]{2,29}$/;
  return regex.test(name);
}

export async function createUserTable(
  clientID: string,
  database: D1Database,
): Promise<void> {
  const validName = ensureTableisValid(clientID);
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS ${validName}_users (
      id TEXT PRIMARY KEY,
      identifier TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL,
      session_private TEXT,
      session_public TEXT,
      created_at TEXT NOT NULL
    );
  `;
  await database.prepare(createTableSQL).run();
}

export async function DeleteOTFusersTable(
  clientID: string,
  database: D1Database,
): Promise<void> {
  const res = await database
    .prepare(`DROP TABLE IF EXISTS ${clientID}_users;`)
    .run();
  if (!res.success) {
    throw new Error("Failed to delete user table", { cause: res.error });
  }
  const dropOpenAuthTable = await database
    .prepare(`DROP TABLE IF EXISTS ${clientID};`)
    .run();
  if (!dropOpenAuthTable.success) {
    throw new Error("Failed to delete openAuth table", {
      cause: dropOpenAuthTable.error,
    });
  }
}

export const OTFusersTable = (clientID: string) =>
  sqliteTable(clientID + "_users", {
    id: text().primaryKey(),
    identifier: text().unique().notNull(),
    data: text({
      mode: "json",
    }).notNull(),
    session_private: text(),
    session_public: text(),
    created_at: text().notNull(),
  });

export function parseDBUser(
  user: Partial<OTFUsersType["select"]>,
): Partial<OTFUsersParsedType> {
  return {
    ...user,
    data: typeof user.data == "string" ? JSON.parse(user.data) : user.data,
    session_private: user.session_private
      ? JSON.parse(user.session_private)
      : null,
    session_public: user.session_public
      ? JSON.parse(user.session_public)
      : null,
  };
}

export function serializeDBUser(
  user: Partial<OTFUsersParsedType>,
): Partial<OTFUsersType["select"]> {
  return {
    ...user,
    data: user.data ? JSON.stringify(user.data) : user.data,
    session_private: user.session_private
      ? JSON.stringify(user.session_private)
      : user.session_private,
    session_public: user.session_public
      ? JSON.stringify(user.session_public)
      : user.session_public,
  };
}

export const projectTable = sqliteTable("openauth_webui_projects", {
  clientID: text().primaryKey(),
  created_at: text().notNull(),
  active: integer({
    mode: "boolean",
  }).default(true),
  providers_data: text({
    mode: "json",
  }).default("[]"),
  themeId: text(),
  codeMode: text(),
  emailTemplateId: text(),
  projectData: text({
    mode: "json",
  }).default("{}"),
  registerOnInvite: integer({
    mode: "boolean",
  }).default(false),
  originURL: text(),
  secret: text().notNull(),
  authEndpointURL: text().notNull(),
  cloudflareDomaineID: text().notNull(),
});

export const emailTemplatesTable = sqliteTable(
  "openauth_webui_email_templates",
  {
    name: text().primaryKey(),
    body: text().notNull(),
    subject: text().notNull(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
);

export const uiStyleTable = sqliteTable("openauth_webui_ui_styles", {
  id: text().primaryKey(),
  themeData: text({
    mode: "json",
  }).notNull(),
});

export const webuiProjectTable = sqliteTable("openauth_webui", {
  key: text().primaryKey(),
  value: text().notNull(),
  expiry: integer(),
});

export const WebUiProjectUserTable = OTFusersTable("openauth_webui");

export const WebUiCopyTemplateTable = sqliteTable(
  "openauth_webui_copy_templates",
  {
    name: text().primaryKey(),
    providerType: text().notNull(),
    copyData: text({
      mode: "json",
    }).notNull(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
);

export const WebUiInviteLinkTable = sqliteTable("openauth_webui_invite_links", {
  id: text().primaryKey(),
  clientID: text().notNull(),
  link: text().notNull(),
  expiresAt: text().notNull(),
  created_at: text().notNull(),
});

export const LogsTable = sqliteTable("openauth_webui_logs", {
  id: text().primaryKey(),
  clientID: text().notNull(),
  type: text().notNull(),
  message: text().notNull(),
  context: text({
    mode: "json",
  }),
  timestamp: text().notNull(),
});

export function insertLog({
  type,
  clientID,
  endpoint,
  message,
  database,
  context,
}: {
  type: "info" | "error" | "warning";
  clientID: string;
  endpoint?: string;
  message: string;
  database: D1Database;
  context?: Record<string, any>;
}): Promise<void> {
  const logEntry = {
    id: crypto.randomUUID(),
    clientID,
    type,
    message: endpoint ? `[${endpoint}] ${message}` : message,
    timestamp: new Date().toISOString(),
    context: context ? JSON.stringify(context) : undefined,
  };
  return drizzle(database)
    .insert(LogsTable)
    .values(logEntry)
    .run()
    .then((res) => {
      if (!res.success) {
        console.error("Failed to insert log entry:", res.error);
      }
    })
    .catch((err) => {
      console.error("Error inserting log entry:", err);
      throw err;
    });
}
