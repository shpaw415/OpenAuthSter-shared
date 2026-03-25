import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CopyDataSelection, Project } from "..";
import { drizzle } from "./drizzle";
import type { OTFUsersParsedType, OTFUsersType } from "./types";

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
	if (!isClientIdValid(clientID))
		throw new Error(`Invalid clientID: "${clientID}"`);
	const validName = ensureTableisValid(clientID);
	const createTableSQL = `
    CREATE TABLE IF NOT EXISTS ${validName}_users (
      id TEXT PRIMARY KEY,
      identifier TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL,
      session_private TEXT,
      session_public TEXT,
	  role TEXT,
      created_at TEXT NOT NULL
    );
  `;
	await database.prepare(createTableSQL).run();
}

export async function DeleteOTFusersTable(
	clientID: string,
	database: D1Database,
): Promise<void> {
	if (!isClientIdValid(clientID))
		throw new Error(`Invalid clientID: "${clientID}"`);
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

export function parseDBUser(
	user: Partial<OTFUsersType["select"]>,
): Partial<OTFUsersParsedType> {
	return {
		...user,
		data: typeof user.data === "string" ? JSON.parse(user.data) : user.data,
		session_private: user.session_private
			? JSON.parse(user.session_private)
			: null,
		session_public: user.session_public
			? JSON.parse(user.session_public)
			: null,
	};
}

export const OTFusersTable = (clientID: string) => {
	const name = `${clientID}_users`;
	if (!isClientIdValid(name))
		throw new Error(`Invalid clientID: "${clientID}"`);

	return sqliteTable(name, {
		id: text().primaryKey(),
		identifier: text().unique().notNull(),
		data: text({
			mode: "json",
		}).notNull(),
		session_private: text(),
		session_public: text(),
		role: text(),
		created_at: text().notNull(),
	});
};

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

export function parseDBProject(
	data: typeof projectTable.$inferSelect,
): Project {
	return {
		...data,
		clientID: String(data.clientID),
		created_at: String(data.created_at),
		active: Boolean(data.active),
		providers_data:
			typeof data.providers_data === "string"
				? JSON.parse(data.providers_data)
				: data.providers_data,
		theme_id: data.theme_id || null,
		emailTemplateId: data.emailTemplateId || null,
		codeMode: String(data.codeMode) === "phone" ? "phone" : "email",
		projectData:
			typeof data.projectData === "string"
				? JSON.parse(data.projectData)
				: data.projectData || {},
		originURL: data.originURL || null,
		authEndpointURL: String(data.authEndpointURL),
		cloudflareDomaineID: String(data.cloudflareDomaineID),
		registerOnInvite: Boolean(data.registerOnInvite),
		secret: String(data.secret),
	} satisfies Project;
}

export const uiStyleTable = sqliteTable("openauth_webui_ui_styles", {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	owner_id: text().notNull(),
	owner_group_id: text().notNull(),
	themeData: text({
		mode: "json",
	}).notNull(),
});

export const projectTable = sqliteTable("openauth_webui_projects", {
	clientID: text().primaryKey(),
	name: text().notNull().default("Project Name"),
	owner_id: text().notNull(),
	owner_group_id: text().notNull(),
	active: integer({
		mode: "boolean",
	}).default(true),
	providers_data: text({
		mode: "json",
	}).default("[]"),
	theme_id: integer().references(() => uiStyleTable.id),
	codeMode: text(),
	emailTemplateId: integer().references(() => emailTemplatesTable.id),
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
	created_at: text().notNull(),
});

export const WebHookTable = sqliteTable("openauth_webui_webhooks", {
	id: text().primaryKey(),
	clientID: text()
		.notNull()
		.references(() => projectTable.clientID),
	event: text().notNull(),
	url: text().notNull(),
	method: text().notNull(),
	headers: text({
		mode: "json",
	}),
	created_at: text().notNull(),
});

export const emailTemplatesTable = sqliteTable(
	"openauth_webui_email_templates",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		body: text().notNull(),
		subject: text().notNull(),
		owner_id: text().notNull(),
		owner_group_id: text().notNull(),
		created_at: text().notNull(),
		updated_at: text().notNull(),
	},
);

export const webuiProjectTable = sqliteTable("openauth_webui", {
	key: text().primaryKey(),
	value: text().notNull(),
	expiry: integer(),
});

export const totpTable = sqliteTable("openauth_totp", {
	user_id: text().primaryKey(),
	clientID: text()
		.notNull()
		.references(() => projectTable.clientID),
	secret: text().notNull(),
	is_verified: integer({
		mode: "boolean",
	}).default(false),
	backup_codes: text({
		mode: "json",
	}).notNull(),
	created_at: text().notNull(),
});

export const totpTokenTable = sqliteTable("openauth_totp_tokens", {
	token: text().primaryKey(),
	user_id: text().notNull(),
	clientID: text()
		.notNull()
		.references(() => projectTable.clientID),
	token_expires_at: text().notNull(),
	created_at: text().notNull(),
});

export type TOTPTableType = Omit<
	typeof totpTable.$inferSelect,
	"created_at"
> & {
	created_at: Date;
};

export function parseDBTOTP(
	data: typeof totpTable.$inferSelect,
): TOTPTableType {
	return {
		...data,
		created_at: new Date(data.created_at),
	} satisfies TOTPTableType;
}

export const WebUiProjectUserTable = OTFusersTable("openauth_webui");

export function parseDBCopyTemplate(
	data: typeof WebUiCopyTemplateTable.$inferSelect,
) {
	return {
		...data,
		copyData: (typeof data.copyData === "string"
			? JSON.parse(data.copyData)
			: data.copyData) as Partial<CopyDataSelection>,
	};
}

export const WebUiCopyTemplateTable = sqliteTable(
	"openauth_webui_copy_templates",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		copyData: text({
			mode: "json",
		}).notNull(),
		owner_id: text().notNull(),
		owner_group_id: text().notNull(),
		created_at: text().notNull(),
		updated_at: text().notNull(),
	},
);

export const WebUiInviteLinkTable = sqliteTable("openauth_webui_invite_links", {
	id: text().primaryKey(),
	clientID: text()
		.notNull()
		.references(() => projectTable.clientID),
	link: text().notNull(),
	expiresAt: text().notNull(),
	created_at: text().notNull(),
});

export const LogsTable = sqliteTable("openauth_webui_logs", {
	id: text().primaryKey(),
	clientID: text()
		.notNull()
		.references(() => projectTable.clientID),
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
	context?: Record<string, unknown>;
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

export const webauthnChallengesTable = sqliteTable("webauthn_challenges", {
	id: text().primaryKey(),
	clientID: text().notNull(),
	challenge: text().notNull(),
	expires_at: text().notNull(),
	created_at: text().notNull(),
});

export const webauthnCredentialsTable = sqliteTable("webauthn_credentials", {
	credential_id: text().primaryKey(),
	user_id: text().notNull(),
	clientID: text().notNull(),
	public_key: text().notNull(),
	counter: integer().notNull(),
	device_type: text(),
	backed_up: integer({
		mode: "boolean",
	}).default(false),
	transports: text({
		mode: "json",
	}),
	created_at: text().notNull(),
});

export const webAuthnTokenAccessTable = sqliteTable("webauthn_token_access", {
	token: text().primaryKey(),
	user_id: text().notNull(),
	clientID: text().notNull(),
	expires_at: text().notNull(),
	created_at: text().notNull(),
});

export const inviteTable = sqliteTable("openauth_webui_ui_invites", {
	id: integer().primaryKey({ autoIncrement: true }),
	/**
	 * User-friendly label for the invite, such as "Invite to Project X" or "Invite to Copy Template Y". This field is used to provide a clear and descriptive name for the invite, making it easier for recipients to understand the purpose of the invite when they receive it. The label can be displayed in the UI alongside other invite details to enhance the user experience and provide context about what the invite is for.
	 */
	label: text().notNull(),
	/**
	 * The ID of the user who sent the invite. This field is used to identify the sender of the invite, allowing for proper attribution and management of invites. When a user receives an invite, this field can be used to display information about who sent the invite and to track the origin of the invite within the system.
	 */
	from_user_id: text().notNull(),
	/**
	 * The name of the user who sent the invite. This field is used to provide a more user-friendly representation of the sender of the invite, allowing recipients to easily recognize who sent the invite without needing to reference the user ID. It can be displayed in the UI alongside the invite details to enhance the user experience and provide context about the invite's origin.
	 */
	from_user_name: text().notNull(),
	/**
	 * The ID of the user who is being invited. This field is used to associate the invite with a specific user in the system, allowing for proper tracking and management of invites. When a user attempts to accept an invite, this field can be used to verify that the invite is intended for them and to grant access to the appropriate resources or permissions.
	 */
	user_id: text().notNull(),
	/**
	 * A unique code associated with the invite, which can be used to identify and validate the invite when a user attempts to accept it. This code should be securely generated to prevent unauthorized access.
	 */
	code: text().notNull(),
	/**
	 * the type of the invite, which can be "project", "email_template", "copy_template", or "ui_style". This field is used to categorize the invite and determine how it should be processed when accepted. For example, a "project" invite would grant access to a specific project, while an "email_template" invite would grant access to a specific email template. This categorization allows for more efficient handling of invites and ensures that the correct resources and permissions are granted to the user upon acceptance.
	 */
	type: text().notNull(),
	/**
	 * the specified group ID that will be assigned to the user upon accepting the invite. This field is used to manage user permissions and access levels within the system. By associating an invite with a specific group ID, administrators can control which resources and functionalities the invited user will have access to once they accept the invite and join the system.
	 */
	owner_group_id: text().notNull(),
	expires_at: text().notNull(),
	created_at: text().notNull(),
	/**
	 * the current status of the invite, which can be "pending", "accepted", or "declined".
	 */
	status: text().default("pending"), // pending, accepted, declined
});
