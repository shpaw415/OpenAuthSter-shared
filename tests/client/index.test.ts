import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { OpenAuthsterClient } from "../../client/user";

describe("OpenAuthsterClient Token Refresh Flow", () => {
	let client: OpenAuthsterClient;
	let mockLocalStorage: Record<string, string> = {};

	beforeEach(() => {
		mockLocalStorage = {};
		global.localStorage = {
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

		global.window = {
			location: {
				search: "",
				origin: "http://localhost",
			},
		} as any;

		client = new OpenAuthsterClient({
			issuerURI: "http://issuer.com",
			clientID: "test-client",
			redirectURI: "http://localhost/callback",
		});
	});

	afterEach(() => {
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
		client.openAuthClient.refresh = mock(async () => {
			refreshCalled = true;
			return {
				tokens: {
					access: "new-access-token",
					refresh: "new-refresh-token",
					expiresIn: 3600,
				},
			};
		});

		await client.init();

		expect(refreshCalled).toBe(true);
		expect(client.token).toBe("new-access-token");
		expect(client.refreshToken).toBe("new-refresh-token");
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
		client.openAuthClient.refresh = mock(async () => {
			refreshCalled = true;
			return {
				tokens: {
					access: "new-access-token",
					refresh: "new-refresh-token",
					expiresIn: 3600,
				},
			};
		});

		await client.init();

		expect(refreshCalled).toBe(false);
		expect(client.token).toBe("valid-token");
		// The timer should be set up
		expect((client as any).refreshTimer).toBeDefined();
	});

	it("should trigger refresh when timer expires", async () => {
		// We can mock setTimeout to execute immediately for testing
		const originalSetTimeout = global.setTimeout;
		let timeoutCallback: Function | null = null;

		global.setTimeout = ((cb: Function, ms: number) => {
			timeoutCallback = cb;
			return 123 as any;
		}) as any;

		const now = Date.now();
		const futureTime = now + 3600 * 1000; // 1 hour from now

		mockLocalStorage["oa_token"] = "valid-token";
		mockLocalStorage["oa_refresh_token"] = "valid-refresh-token";
		mockLocalStorage["oa_expires_at"] = futureTime.toString();

		let refreshCalled = false;
		client.openAuthClient.refresh = mock(async () => {
			refreshCalled = true;
			return {
				tokens: {
					access: "new-access-token",
					refresh: "new-refresh-token",
					expiresIn: 3600,
				},
			};
		});

		await client.init();

		expect(refreshCalled).toBe(false);
		expect(timeoutCallback).not.toBeNull();

		// Trigger the timeout
		if (timeoutCallback) {
			timeoutCallback();
		}

		// Wait for promises to resolve
		await new Promise((resolve) => process.nextTick(resolve));

		expect(refreshCalled).toBe(true);
		expect(client.token).toBe("new-access-token");

		// Restore setTimeout
		global.setTimeout = originalSetTimeout;
	});
});
