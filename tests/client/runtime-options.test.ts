import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { OpenAuthsterClient } from "../../client/user";

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

function createAuthorizeResponse() {
	return {
		url: "http://issuer.com/authorize?state=auth-state",
		challenge: {
			state: "auth-state",
			verifier: "verifier",
			method: "S256",
		},
	};
}

describe("OpenAuthsterClient runtime options", () => {
	let mockLocalStorage: Record<string, string> = {};

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
				href: "http://localhost/",
			},
		} as unknown as typeof window;
	});

	afterEach(() => {
		mock.restore();
	});

	it("uses the configured copyID during login when no per-call override is provided", async () => {
		const client = new OpenAuthsterClient({
			issuerURI: "http://issuer.com",
			clientID: "test-client",
			redirectURI: "http://localhost/callback",
			copyID: "en-us",
		});

		client.openAuthClient.authorize = mock(async () =>
			createAuthorizeResponse(),
		) as typeof client.openAuthClient.authorize;

		const loginURL = await client.login({ autoNavigate: false });

		expect(new URL(loginURL).searchParams.get("copy_id")).toBe("en-us");
	});

	it("updates the default copyID at runtime", async () => {
		const client = new OpenAuthsterClient({
			issuerURI: "http://issuer.com",
			clientID: "test-client",
			redirectURI: "http://localhost/callback",
		});

		client.updateOptions({ copyID: "fr-fr" });
		client.openAuthClient.authorize = mock(async () =>
			createAuthorizeResponse(),
		) as typeof client.openAuthClient.authorize;

		const loginURL = await client.login({ autoNavigate: false });

		expect(new URL(loginURL).searchParams.get("copy_id")).toBe("fr-fr");
	});

	it("deduplicates concurrent refresh attempts", async () => {
		const client = new OpenAuthsterClient({
			issuerURI: "http://issuer.com",
			clientID: "test-client",
			redirectURI: "http://localhost/callback",
			refreshToken: "refresh-token",
		});

		let resolveRefresh!: (
			value: ReturnType<typeof createRefreshSuccess>,
		) => void;
		const refreshGate = new Promise<ReturnType<typeof createRefreshSuccess>>(
			(resolve) => {
				resolveRefresh = resolve;
			},
		);

		client.openAuthClient.refresh = mock(
			async () => refreshGate,
		) as typeof client.openAuthClient.refresh;

		const refreshA = client.triggerRefresh();
		const refreshB = client.triggerRefresh();

		expect(client.openAuthClient.refresh).toHaveBeenCalledTimes(1);
		resolveRefresh(createRefreshSuccess());

		const [resultA, resultB] = await Promise.all([refreshA, refreshB]);

		expect(resultA).toBe(true);
		expect(resultB).toBe(true);
		expect(client.getToken()).toBe("new-access-token");
	});

	it("releases listeners and timer state on dispose", () => {
		const client = new OpenAuthsterClient({
			issuerURI: "http://issuer.com",
			clientID: "test-client",
			redirectURI: "http://localhost/callback",
		});
		const internalClient = client as unknown as {
			refreshTimer?: ReturnType<typeof setTimeout>;
			initListeners: Map<string, unknown>;
		};

		client.addInitializationListener("listener", async () => {});
		internalClient.refreshTimer = setTimeout(() => undefined, 1000);

		client.dispose();

		expect(internalClient.refreshTimer).toBeUndefined();
		expect(internalClient.initListeners.size).toBe(0);
	});
});
