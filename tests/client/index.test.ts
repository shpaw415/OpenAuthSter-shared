import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { OpenAuthsterClient } from "../../client/user";
import type { ProviderType } from "openauth-webui-shared-types";

function createRefreshSuccess() {
	return {
		err: false as const,
		tokens: {
			access: "new-access-token",
			refresh: "new-refresh-token",
			expiresIn: 3600,
		},
	};
}

function createSessionResponse(overrides?: {
	public?: Record<string, unknown> | null;
	private?: Record<string, unknown> | null;
	userInfo?: Record<string, unknown>;
	error?: string;
	success?: boolean;
}) {
	return {
		success: overrides?.success ?? true,
		data:
			overrides?.success === false
				? undefined
				: {
						public: overrides?.public ?? { theme: "amber" },
						private: overrides?.private ?? { featureFlag: true },
						user_id: "user-123",
						user_identifier: "alice@example.com",
						userInfo: overrides?.userInfo ?? {
							provider: "password",
							role: "admin",
						},
					},
		error: overrides?.error,
	};
}

describe("OpenAuthsterClient Token Refresh Flow", () => {
	let client: OpenAuthsterClient<
		Record<string, unknown>,
		Record<string, unknown>,
		{ provider: ProviderType; role: "admin" | "user" },
		"admin" | "user"
	>;
	let mockLocalStorage: Record<string, string> = {};
	const originalFetch = global.fetch;

	beforeEach(() => {
		mockLocalStorage = {};
		const localStorageMock: Storage = {
			getItem: (key: string) => mockLocalStorage[key] || null,
			setItem: (key: string, value: string) => {
				mockLocalStorage[key] = value;
			},
			removeItem: (key: string) => {
				delete mockLocalStorage[key];
			},
			clear: () => {
				mockLocalStorage = {};
			},
			length: 0,
			key: () => null,
		};
		global.localStorage = localStorageMock;

		global.window = {
			location: {
				search: "",
				origin: "http://localhost",
			},
		} as unknown as typeof window;

		client = new OpenAuthsterClient({
			issuerURI: "http://issuer.com",
			clientID: "test-client",
			redirectURI: "http://localhost/callback",
		});
	});

	afterEach(() => {
		global.fetch = originalFetch;
		client.logout();
	});

	it("should trigger refresh if token is expired on init", async () => {
		const now = Date.now();
		const expiredTime = now - 10000; // 10 seconds ago

		mockLocalStorage["oa_token"] = "expired-token";
		mockLocalStorage["oa_refresh_token"] = "valid-refresh-token";
		mockLocalStorage["oa_expires_at"] = expiredTime.toString();

		let refreshCalled = false;

		// Mock the openAuthClient.refresh method
		client.openAuthClient.refresh = mock(async (_refreshToken: string) => {
			refreshCalled = true;
			return createRefreshSuccess();
		});

		await client.init();

		const internalClient = client as unknown as Record<string, unknown>;
		expect(refreshCalled).toBe(true);
		expect(client.getToken()).toBe("new-access-token");
		expect(internalClient["refreshToken"]).toBe("new-refresh-token");
		expect(mockLocalStorage["oa_token"]).toBe("new-access-token");
		expect(mockLocalStorage["oa_refresh_token"]).toBe("new-refresh-token");
	});

	it("should set up a reset timer if token is not expired on init", async () => {
		const now = Date.now();
		const futureTime = now + 3600 * 1000; // 1 hour from now

		mockLocalStorage["oa_token"] = "valid-token";
		mockLocalStorage["oa_refresh_token"] = "valid-refresh-token";
		mockLocalStorage["oa_expires_at"] = futureTime.toString();

		let refreshCalled = false;
		client.openAuthClient.refresh = mock(async (_refreshToken: string) => {
			refreshCalled = true;
			return createRefreshSuccess();
		});

		await client.init();

		const internalClient = client as unknown as Record<string, unknown>;
		expect(refreshCalled).toBe(false);
		expect(client.getToken()).toBe("valid-token");
		// The timer should be set up
		expect(internalClient["refreshTimer"]).toBeDefined();
	});

	it("should trigger refresh when timer expires", async () => {
		// We can mock setTimeout to execute immediately for testing
		const originalSetTimeout = global.setTimeout;
		let timeoutCallback: unknown = null;

		global.setTimeout = ((cb: TimerHandler, _ms?: number) => {
			timeoutCallback = cb;
			return 123 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout;

		const now = Date.now();
		const futureTime = now + 3600 * 1000; // 1 hour from now

		mockLocalStorage["oa_token"] = "valid-token";
		mockLocalStorage["oa_refresh_token"] = "valid-refresh-token";
		mockLocalStorage["oa_expires_at"] = futureTime.toString();

		let refreshCalled = false;
		client.openAuthClient.refresh = mock(async (_refreshToken: string) => {
			refreshCalled = true;
			return createRefreshSuccess();
		});

		try {
			await client.init();

			expect(refreshCalled).toBe(false);
			expect(timeoutCallback).not.toBeNull();

			if (typeof timeoutCallback === "function") {
				const scheduledCallback = timeoutCallback as () => Promise<boolean>;
				await scheduledCallback();
			} else {
				throw new Error("Expected a function timeout callback");
			}

			expect(refreshCalled).toBe(true);
			expect(client.getToken()).toBe("new-access-token");
		} finally {
			global.setTimeout = originalSetTimeout;
		}
	});

	it("should read token from cookie when authorization header is missing", () => {
		const token = client.getTokenFromRequest(
			new Request("http://localhost/session", {
				headers: {
					Cookie: "foo=bar; access_token=cookie-token; another=value",
				},
			}),
		);

		expect(token).toBe("cookie-token");
	});

	it("should fetch public session data and update client state", async () => {
		const internalClient = client as unknown as Record<string, unknown>;
		internalClient["token"] = "live-access-token";

		let requestUrl = "";
		let authorizationHeader = "";
		global.fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				requestUrl = input.toString();
				authorizationHeader =
					new Headers(init?.headers).get("Authorization") || "";
				return new Response(JSON.stringify(createSessionResponse()), {
					headers: {
						"Content-Type": "application/json",
					},
				});
			},
		) as unknown as typeof fetch;

		const response = await client.getUserSession("public");

		expect(requestUrl).toBe(
			"http://issuer.com/session/public?client_id=test-client",
		);
		expect(authorizationHeader).toBe("Bearer live-access-token");
		expect(response).toEqual({
			public: { theme: "amber" },
			private: { featureFlag: true },
			user_id: "user-123",
			user_identifier: "alice@example.com",
			userInfo: { provider: "password", role: "admin" },
		});
		expect(client.data.public).toEqual({ theme: "amber" });
		expect(client.data.private).toEqual({ featureFlag: true });
		expect(client.userMeta).toEqual({
			user_id: "user-123",
			user_identifier: "alice@example.com",
			role: "admin",
		});
		expect(client.userInfo).toEqual({ provider: "password", role: "admin" });
	});

	it("should send patch payload when updating private session data", async () => {
		const internalClient = client as unknown as Record<string, unknown>;
		internalClient["token"] = "live-access-token";
		internalClient["secret"] = "server-secret";

		let requestUrl = "";
		let requestBody = "";
		let requestMethod = "";
		let authHeader = "";
		global.fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				requestUrl = input.toString();
				requestBody = String(init?.body || "");
				requestMethod = init?.method || "GET";
				authHeader = new Headers(init?.headers).get("Authorization") || "";
				return new Response(
					JSON.stringify(
						createSessionResponse({
							private: { featureFlag: false, betaUser: true },
						}),
					),
					{
						headers: {
							"Content-Type": "application/json",
						},
					},
				);
			},
		) as unknown as typeof fetch;

		const response = await client.updateUserSession("private", {
			betaUser: true,
		});

		expect(requestUrl).toBe(
			"http://issuer.com/session/private?client_id=test-client",
		);
		expect(requestMethod).toBe("PATCH");
		expect(requestBody).toBe(JSON.stringify({ betaUser: true }));
		expect(authHeader).toBe("Bearer live-access-token");
		expect(response).toEqual({
			public: { theme: "amber" },
			private: { featureFlag: false, betaUser: true },
			user_id: "user-123",
			user_identifier: "alice@example.com",
			userInfo: { provider: "password", role: "admin" },
		});
		expect(client.data.private).toEqual({ featureFlag: false, betaUser: true });
	});

	it("should delete the authenticated user and clear local auth state", async () => {
		const internalClient = client as unknown as Record<string, unknown>;
		internalClient["token"] = "live-access-token";
		internalClient["refreshToken"] = "refresh-token";
		client.isAuthenticated = true;
		mockLocalStorage["oa_token"] = "live-access-token";
		mockLocalStorage["oa_refresh_token"] = "refresh-token";

		let requestUrl = "";
		let requestMethod = "";
		let authHeader = "";
		global.fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				requestUrl = input.toString();
				requestMethod = init?.method || "GET";
				authHeader = new Headers(init?.headers).get("Authorization") || "";
				return new Response(
					JSON.stringify({
						success: true,
						data: null,
						error: null,
					}),
					{
						headers: {
							"Content-Type": "application/json",
						},
					},
				);
			},
		) as unknown as typeof fetch;

		const result = await client.deleteCurrentUser();

		expect(requestUrl).toBe(
			"http://issuer.com/manage/user?client_id=test-client",
		);
		expect(requestMethod).toBe("DELETE");
		expect(authHeader).toBe("Bearer live-access-token");
		expect(result).toEqual({ success: true, error: null });
		expect(client.getToken()).toBeNull();
		expect(client.isAuthenticated).toBe(false);
		expect(mockLocalStorage["oa_token"]).toBeUndefined();
		expect(mockLocalStorage["oa_refresh_token"]).toBeUndefined();
	});

	it("should keep auth state when deleting the authenticated user fails", async () => {
		const internalClient = client as unknown as Record<string, unknown>;
		internalClient["token"] = "live-access-token";
		internalClient["refreshToken"] = "refresh-token";
		client.isAuthenticated = true;
		mockLocalStorage["oa_token"] = "live-access-token";
		mockLocalStorage["oa_refresh_token"] = "refresh-token";

		global.fetch = mock(async () => {
			return new Response(
				JSON.stringify({
					success: false,
					data: null,
					error: "Unauthorized: Invalid token",
				}),
				{
					headers: {
						"Content-Type": "application/json",
					},
					status: 401,
				},
			);
		}) as unknown as typeof fetch;

		const result = await client.deleteCurrentUser();

		expect(result).toEqual({
			success: false,
			error: "Failed to delete current user: Unauthorized: Invalid token",
		});
		expect(client.getToken()).toBe("live-access-token");
		expect(client.isAuthenticated).toBe(true);
		expect(mockLocalStorage["oa_token"]).toBe("live-access-token");
		expect(mockLocalStorage["oa_refresh_token"]).toBe("refresh-token");
	});

	it("should surface a session fetch error when issuer returns a failure payload", async () => {
		const internalClient = client as unknown as Record<string, unknown>;
		internalClient["token"] = "live-access-token";
		global.fetch = mock(async () => {
			return new Response(
				JSON.stringify(
					createSessionResponse({
						success: false,
						error: "Unauthorized: Invalid token",
					}),
				),
				{
					headers: {
						"Content-Type": "application/json",
					},
				},
			);
		}) as unknown as typeof fetch;

		const response = await client.getUserSession("private");

		expect(response).toBeInstanceOf(Error);
		expect((response as Error).message).toContain(
			"Failed to fetch user session: Unauthorized: Invalid token",
		);
	});

	it("should refresh before fetching when the access token is expired", async () => {
		const internalClient = client as unknown as Record<string, unknown>;
		internalClient["token"] = "expired-access-token";
		internalClient["refreshToken"] = "refresh-token";
		client.expiresAt = new Date(Date.now() - 1000);

		let refreshCalled = false;
		client.openAuthClient.refresh = mock(async (refreshToken: string) => {
			refreshCalled = true;
			expect(refreshToken).toBe("refresh-token");
			return createRefreshSuccess();
		});

		let authorizationHeader = "";
		global.fetch = mock(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				authorizationHeader =
					new Headers(init?.headers).get("Authorization") || "";
				return new Response(JSON.stringify(createSessionResponse()), {
					headers: {
						"Content-Type": "application/json",
					},
				});
			},
		) as unknown as typeof fetch;

		await client.getUserSession("public");

		expect(refreshCalled).toBe(true);
		expect(authorizationHeader).toBe("Bearer new-access-token");
		expect(client.getToken()).toBe("new-access-token");
	});

	it("should log out after refresh retries are exhausted when no login callback is set", async () => {
		const originalSetTimeout = global.setTimeout;
		const internalClient = client as unknown as Record<string, unknown>;
		internalClient["token"] = "expired-access-token";
		internalClient["refreshToken"] = "refresh-token";
		client.expiresAt = new Date(Date.now() - 1000);

		const delays: number[] = [];
		global.setTimeout = ((cb: TimerHandler, ms?: number) => {
			delays.push(ms as number);
			if (typeof cb === "function") {
				void cb();
			}
			return 1 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout;

		client.openAuthClient.refresh = mock(async () => {
			throw new Error("refresh failed");
		});

		try {
			const success = await client.triggerRefresh();

			expect(success).toBe(false);
			expect(delays).toEqual([2000, 4000, 6000]);
			expect(client.getToken()).toBeNull();
			expect(client.isAuthenticated).toBe(false);
			expect(mockLocalStorage["oa_token"]).toBeUndefined();
			expect(mockLocalStorage["oa_refresh_token"]).toBeUndefined();
		} finally {
			global.setTimeout = originalSetTimeout;
		}
	});

	it("should call onLoginRequired after refresh retries are exhausted", async () => {
		const originalSetTimeout = global.setTimeout;
		const onLoginRequired = mock(() => {});
		const callbackClient = new OpenAuthsterClient({
			issuerURI: "http://issuer.com",
			clientID: "test-client",
			redirectURI: "http://localhost/callback",
			authFlowCallbacks: {
				onLoginRequired,
			},
		});
		const internalClient = callbackClient as unknown as Record<string, unknown>;
		internalClient["token"] = "expired-access-token";
		internalClient["refreshToken"] = "refresh-token";
		callbackClient.expiresAt = new Date(Date.now() - 1000);

		global.setTimeout = ((cb: TimerHandler) => {
			if (typeof cb === "function") {
				void cb();
			}
			return 1 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout;

		callbackClient.openAuthClient.refresh = mock(async () => {
			throw new Error("refresh failed");
		});

		try {
			const success = await callbackClient.triggerRefresh();

			expect(success).toBe(false);
			expect(onLoginRequired).toHaveBeenCalledTimes(1);
			expect(onLoginRequired).toHaveBeenCalledWith(callbackClient);
		} finally {
			global.setTimeout = originalSetTimeout;
			callbackClient.logout();
		}
	});
});
