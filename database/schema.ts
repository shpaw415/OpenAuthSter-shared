import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

const reservedTableNames = [
  "openauth_webui_projects",
  "openauth_webui_email_templates",
  "openauth_webui",
  "openauth_webui_ui_styles",
  "openauth_webui_copy_templates",
];

const ensureTableisValid = (name: string) => {
  if (reservedTableNames.includes(name))
    throw new Error("Table name is reserved");
  return name;
};

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
}

export const OTFusersTable = (clientID: string) =>
  sqliteTable(clientID + "_users", {
    id: text().primaryKey(),
    identifier: text().unique().notNull(),
    data: text({
      mode: "json",
    }).notNull(),
    created_at: text().notNull(),
  });

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
