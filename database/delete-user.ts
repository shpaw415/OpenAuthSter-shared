import {
	OTFusersTable,
	parseDBUser,
	totpTable,
	totpTokenTable,
	webauthnCredentialsTable,
	webAuthnTokenAccessTable,
	type OTFUsersParsedType,
} from "./schema";
import { and, drizzle, eq } from "./drizzle";
import type { StorageAdapter } from "@kagii/openauth/storage/storage";
import { D1Storage } from "@kagii/openauth/storage/d1";

export async function deleteUserWithAuthState({
	userID,
	clientID,
	d1db,
}: {
	userID: string;
	clientID: string;
	d1db: D1Database;
}): Promise<
	{ success: true } | { success: false; error: string; status: 404 | 400 }
> {
	const db = drizzle(d1db);
	const userTable = OTFusersTable(clientID);
	const rawUser = await db
		.select()
		.from(userTable)
		.where(eq(userTable.id, userID))
		.get();

	if (!rawUser) {
		return {
			success: false,
			error: "User not found",
			status: 404,
		};
	}

	const user = parseDBUser(rawUser) as OTFUsersParsedType;

	await cleanupOpenAuthStateForUser({
		user,
		clientID,
		d1db,
	});
	await cleanupUserLinkedRecords({
		userID,
		clientID,
		d1db,
	});

	const deleteResult = await db
		.delete(userTable)
		.where(eq(userTable.id, userID))
		.run();

	if (!deleteResult.success) {
		return {
			success: false,
			error: "Failed to delete user",
			status: 400,
		};
	}

	return { success: true };
}

async function cleanupUserLinkedRecords({
	userID,
	clientID,
	d1db,
}: {
	userID: string;
	clientID: string;
	d1db: D1Database;
}) {
	const db = drizzle(d1db);

	await db
		.delete(totpTable)
		.where(and(eq(totpTable.user_id, userID), eq(totpTable.clientID, clientID)))
		.run();

	await db
		.delete(totpTokenTable)
		.where(
			and(
				eq(totpTokenTable.user_id, userID),
				eq(totpTokenTable.clientID, clientID),
			),
		)
		.run();

	await db
		.delete(webauthnCredentialsTable)
		.where(
			and(
				eq(webauthnCredentialsTable.user_id, userID),
				eq(webauthnCredentialsTable.clientID, clientID),
			),
		)
		.run();

	await db
		.delete(webAuthnTokenAccessTable)
		.where(
			and(
				eq(webAuthnTokenAccessTable.user_id, userID),
				eq(webAuthnTokenAccessTable.clientID, clientID),
			),
		)
		.run();
}

async function cleanupOpenAuthStateForUser({
	user,
	clientID,
	d1db,
}: {
	user: OTFUsersParsedType;
	clientID: string;
	d1db: D1Database;
}) {
	if (!(await openAuthTableExists({ clientID, d1db }))) {
		return;
	}

	const storage = D1Storage({
		database: d1db,
		table: clientID,
	}) as StorageAdapter;
	const storageKeysToRemove = new Map<string, string[]>();
	const knownSubjects = new Set<string>();
	const addStorageKey = (key: string[]) => {
		storageKeysToRemove.set(createStorageKeyFingerprint(key), key);
	};

	knownSubjects.add(
		await resolveOpenAuthSubject(
			"user",
			buildIssuerSubjectPayload(user, clientID),
		),
	);

	for (const key of getProviderStorageKeys(user)) {
		addStorageKey(key);

		if (key.at(-1) === "subject") {
			const storedSubject = await storage.get(key);
			if (typeof storedSubject === "string") {
				knownSubjects.add(storedSubject);
			}
		}
	}

	for (const subject of knownSubjects) {
		for await (const [key] of storage.scan(["oauth:refresh", subject])) {
			addStorageKey(key);
		}
	}

	for await (const [key, value] of storage.scan(["oauth:refresh"])) {
		if (
			isOpenAuthRecordOwnedByUser({
				value,
				userID: user.id,
				subjects: knownSubjects,
			})
		) {
			addStorageKey(key);
		}
	}

	for await (const [key, value] of storage.scan(["oauth:code"])) {
		if (
			isOpenAuthRecordOwnedByUser({
				value,
				userID: user.id,
				subjects: knownSubjects,
			})
		) {
			addStorageKey(key);
		}
	}

	for (const key of storageKeysToRemove.values()) {
		await storage.remove(key);
	}
}

function createStorageKeyFingerprint(key: string[]): string {
	return JSON.stringify(key);
}

function buildIssuerSubjectPayload(user: OTFUsersParsedType, clientID: string) {
	return {
		id: user.id,
		data: user.data ?? {},
		identifier: user.identifier,
		clientID,
		provider: user.data?.provider ?? "password",
		role: null,
	};
}

async function resolveOpenAuthSubject(
	type: string,
	properties: Record<string, unknown>,
): Promise<string> {
	const data = new TextEncoder().encode(JSON.stringify(properties));
	const hashBuffer = await crypto.subtle.digest("SHA-1", data);
	const hashHex = Array.from(new Uint8Array(hashBuffer))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
	return `${type}:${hashHex.slice(0, 16)}`;
}

function getProviderStorageKeys(user: OTFUsersParsedType): string[][] {
	if (user.data?.provider === "password") {
		return [
			["email", String(user.identifier).toLowerCase(), "password"],
			["email", String(user.identifier).toLowerCase(), "subject"],
		];
	}

	return [];
}

function isOpenAuthRecordOwnedByUser({
	value,
	userID,
	subjects,
}: {
	value: unknown;
	userID: string;
	subjects: Set<string>;
}): boolean {
	if (!value || typeof value !== "object") return false;

	const record = value as {
		subject?: unknown;
		properties?: {
			id?: unknown;
		};
	};

	return (
		record.properties?.id === userID ||
		(typeof record.subject === "string" && subjects.has(record.subject))
	);
}

async function openAuthTableExists({
	clientID,
	d1db,
}: {
	clientID: string;
	d1db: D1Database;
}): Promise<boolean> {
	const result = await d1db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
		.bind(clientID)
		.first();

	return Boolean(result);
}
