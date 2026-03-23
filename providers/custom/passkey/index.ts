import type { AuthorizationState } from "@kagii/openauth/issuer";
import type { Provider } from "@kagii/openauth/provider/provider";
import { Layout } from "@kagii/openauth/ui/base";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
	type AuthenticatorTransportFuture,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { jsxRenderer } from "hono/jsx-renderer";
import {
	OTFusersTable,
	webAuthnTokenAccessTable,
	webauthnChallengesTable,
	webauthnCredentialsTable,
} from "../../../database/schema";
import ClientScript from "../../build/passkey/client.js" with { type: "text" };
import { PassKeyUI } from "./passkey_ui";

export const PASSKEY_DEFAULT_COPY = {
	title: "Sign in with Passkey",
};

export interface WebAuthnProviderConfig {
	db: D1Database;
	rpID: string;
	origin: string;
	/**
	 * - App flow: Client side SDK handles the entire flow, including challenge generation and response verification. The app is responsible for calling the appropriate endpoints to generate challenges and verify responses, and then exchanging a token for authentication.
	 * - Auth flow: The provider handles the entire authentication flow, including generating the challenge, verifying the response, and establishing a session. The app simply redirects the user to the provider's authorization endpoint and receives a callback upon successful authentication.
	 *
	 * @default app
	 */
	flow?: "app" | "auth";
	UI: ReturnType<typeof PassKeyUI>;
}

// Helper for Base64URL to Uint8Array (Mock of Buffer.from(str, 'base64url'))
function base64UrlToUint8Array(base64Url: string): Uint8Array {
	const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
	const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

const challenges = {
	async generate({
		db,
		client_id,
		options,
	}: {
		db: D1Database;
		client_id: string;
		options: {
			rpID: string;
			allowCredentials?: {
				id: Base64URLString;
				transports?: AuthenticatorTransportFuture[];
			}[];
		};
	}) {
		const _db = drizzle(db);

		const opt = await generateAuthenticationOptions({
			...options,
			userVerification: "preferred",
			challenge: crypto.randomUUID(),
		});

		const challengeData = await _db
			.insert(webauthnChallengesTable)
			.values({
				id: crypto.randomUUID(),
				clientID: client_id,
				challenge: opt.challenge,
				expires_at: new Date(Date.now() + 60000 * 5).toISOString(), // 5min
				created_at: new Date().toISOString(),
			})
			.returning({
				id: webauthnChallengesTable.id,
				challenge: webauthnChallengesTable.challenge,
				expires_at: webauthnChallengesTable.expires_at,
			})
			.get();

		return {
			challenge: challengeData,
			options: opt,
		};
	},
	/**
	 * Retrieves the latest valid challenge for a given user and client, and provides a method to delete it after use.
	 * @param client_id - The client ID associated with the challenge.
	 * @param user_id - The user ID associated with the challenge.
	 * @param db - The database instance to query against.
	 * @returns An object containing the challenge and a delete method, or null if no valid/expired challenge is found.
	 */
	async retrieve({
		client_id,
		challenge_id,
		db,
	}: {
		client_id: string;
		challenge_id: string;
		db: D1Database;
	}) {
		const _db = drizzle(db);

		const _challenge = await _db
			.select()
			.from(webauthnChallengesTable)
			.where(
				and(
					eq(webauthnChallengesTable.clientID, client_id),
					eq(webauthnChallengesTable.id, challenge_id),
				),
			)
			.orderBy(desc(webauthnChallengesTable.created_at))
			.limit(1)
			.get();

		if (!_challenge || new Date(_challenge.expires_at) < new Date()) {
			return null;
		}

		return {
			challenge: _challenge.challenge,
			delete() {
				return _db
					.delete(webauthnChallengesTable)
					.where(eq(webauthnChallengesTable.id, _challenge.id))
					.run() as unknown as Promise<void>;
			},
		};
	},
} as const;

const credentials = {
	async retrive({
		db,
		credsId,
		client_id,
	}: {
		db: D1Database;
		credsId: string;
		client_id: string;
	}) {
		const _db = drizzle(db);

		const creds = await _db
			.select()
			.from(webauthnCredentialsTable)
			.where(
				and(
					eq(webauthnCredentialsTable.credential_id, credsId),
					eq(webauthnCredentialsTable.clientID, client_id),
				),
			)
			.get()
			.then((res) =>
				res
					? {
							...res,
							public_key: new Uint8Array(base64UrlToUint8Array(res.public_key)),
						}
					: null,
			);

		if (!creds) return null;

		return {
			creds,
			updateCounter(newCounter: number) {
				return _db
					.update(webauthnCredentialsTable)
					.set({ counter: newCounter })
					.where(
						and(
							eq(webauthnCredentialsTable.credential_id, credsId),
							eq(webauthnCredentialsTable.clientID, client_id),
						),
					)
					.run() as unknown as Promise<void>;
			},
			async verify({
				challenge,
				payload,
				origin,
				rpID,
			}: {
				challenge: string;
				payload: AuthenticationResponseJSON;
				origin: string;
				rpID: string;
			}) {
				if (!creds) return Promise.reject(new Error("Credential not found"));
				const verified = await verifyAuthenticationResponse({
					response: payload,
					expectedChallenge: challenge,
					expectedOrigin: origin,
					expectedRPID: rpID,
					credential: {
						publicKey: creds.public_key,
						id: creds.credential_id,
						counter: creds.counter,
						transports: creds.transports
							? (creds.transports as AuthenticatorTransportFuture[])
							: undefined,
					},
					requireUserVerification: true,
				});

				if (!verified.verified) {
					return null;
				}

				return {
					verified,
					getUser() {
						return _db
							.select()
							.from(OTFusersTable(client_id))
							.where(eq(OTFusersTable(client_id).id, creds.user_id))
							.get();
					},
				};
			},
		};
	},
} as const;

const TokenAccess = {
	async generate({
		db,
		user_id,
		client_id,
	}: {
		db: D1Database;
		user_id: string;
		client_id: string;
	}) {
		const token = crypto.randomUUID();
		const expires_at = new Date(Date.now() + 1000 * 60 * 5).toISOString(); // 5 min
		const created_at = new Date().toISOString();

		const createdToken = (
			await drizzle(db)
				.insert(webAuthnTokenAccessTable)
				.values({
					token,
					user_id,
					clientID: client_id,
					expires_at,
					created_at,
				})
				.returning({
					token: webAuthnTokenAccessTable.token,
					expires_at: webAuthnTokenAccessTable.expires_at,
				})
		).at(0);

		if (!createdToken) {
			throw new Error("Failed to create token");
		}

		return createdToken;
	},
	async retrive({ db, token }: { db: D1Database; token: string }) {
		const record = await drizzle(db)
			.select()
			.from(webAuthnTokenAccessTable)
			.where(eq(webAuthnTokenAccessTable.token, token))
			.get();

		if (!record || new Date(record.expires_at).getTime() < Date.now()) {
			return null;
		}
		return {
			token: record,
			delete() {
				return drizzle(db)
					.delete(webAuthnTokenAccessTable)
					.where(eq(webAuthnTokenAccessTable.token, token))
					.run() as unknown as Promise<void>;
			},
		};
	},
};

export function WebAuthnProvider(
	config: WebAuthnProviderConfig,
): Provider<{ identifier: string }> {
	return {
		type: "passkey",
		init(routes, ctx) {
			routes.get(
				"/authorize",
				jsxRenderer(({ children }) => Layout({ children })),
			);

			// TODO: the challenge must be accessed via the client to be signed
			routes.get("/authorize", async (c) => {
				const authorizationCookie = await ctx.get<
					AuthorizationState | undefined
				>(c, "authorization");
				if (!authorizationCookie) return c.text("Unauthorized", 401);

				const flow = config.flow ?? "app";
				if (flow === "app") {
					const url = new URL(authorizationCookie.redirect_uri);
					url.searchParams.set("flow", "passkey");
					return c.redirect(url.toString());
				}

				return c.text("Passkey provider authorization endpoint");

				// return c.html(
				//   config.UI({
				//     callbackUrl: `/passkey/callback?user_id=${userID}&client_id=${clientID}`,
				//     options,
				//   }),
				// );
			});

			routes.get("/client.js", async (c) =>
				c.newResponse(ClientScript as string, 200, {
					"Content-Type": "application/javascript",
				}),
			);

			// SDK Auth Flow Endpoints

			routes.get("/generate_challenge", async (c) => {
				const env = c.env as Env;

				const authorizationCookie = await ctx.get<
					AuthorizationState | undefined
				>(c, "authorization");

				if (!authorizationCookie) {
					return c.json({ error: "Unauthorized" }, 401);
				}

				try {
					const challengeEntry = await challenges.generate({
						db: env.AUTH_DB,
						client_id: authorizationCookie.client_id,
						options: {
							rpID: config.rpID,
						},
					});

					return c.json(challengeEntry);
				} catch (e) {
					console.error(e);
					return c.json({ error: "Error generating challenge" }, 500);
				}
			});

			routes.post("/authorize/token/:challenge_id", async (c) => {
				const env = c.env as Env;
				const payload = (await c.req.json()) as AuthenticationResponseJSON;
				const challenge_id = c.req.param("challenge_id");

				if (!challenge_id) {
					return c.text("Challenge ID is required", 400);
				}

				const authorizationCookie = await ctx.get<
					AuthorizationState | undefined
				>(c, "authorization");

				if (!authorizationCookie) {
					return c.json({ error: "Unauthorized" }, 401);
				}

				const challengeEntry = await challenges.retrieve({
					db: env.AUTH_DB,
					challenge_id,
					client_id: authorizationCookie.client_id,
				});

				if (!challengeEntry) {
					return c.json({ error: "Invalid challenge" }, 400);
				}

				const creds = await credentials.retrive({
					db: env.AUTH_DB,
					credsId: payload.id,
					client_id: authorizationCookie.client_id,
				});
				if (!creds) return c.json({ error: "Credential not found" }, 400);

				try {
					const verified = await creds.verify({
						challenge: challengeEntry.challenge,
						payload,
						origin: config.origin,
						rpID: config.rpID,
					});

					if (!verified) throw new Error("Verification failed");

					await Promise.all([
						creds.updateCounter(
							verified.verified.authenticationInfo.newCounter,
						),
						challengeEntry.delete(),
					]);
					const tokenEntry = await TokenAccess.generate({
						db: config.db,
						user_id: creds.creds.user_id,
						client_id: authorizationCookie.client_id,
					});

					return c.json(tokenEntry);
				} catch (e) {
					console.error("Verification error:", e);
					return c.json(
						{ error: e instanceof Error ? e.message : "Verification failed" },
						400,
					);
				}
			});

			routes.get("/callback/:token", async (c) => {
				const token = c.req.param("token");
				const authorizationCookie = await ctx.get<
					AuthorizationState | undefined
				>(c, "authorization");

				if (!authorizationCookie) {
					return c.json({ error: "Unauthorized" }, 401);
				}

				const tokenRecord = await TokenAccess.retrive({
					db: config.db,
					token,
				});

				if (!tokenRecord) {
					return c.json({ valid: false });
				}

				await tokenRecord.delete();

				const userTable = OTFusersTable(authorizationCookie.client_id);

				const user = await drizzle(config.db)
					.select({ identifier: userTable.identifier })
					.from(userTable)
					.where(eq(userTable.id, tokenRecord.token.user_id))
					.get();

				if (!user) {
					return c.json({ error: "User not found" }, 404);
				}

				return ctx.success(c, {
					identifier: user.identifier,
				});
			});
		},
	};
}

export { PassKeyUI };
