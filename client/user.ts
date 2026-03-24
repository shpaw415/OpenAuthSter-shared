import type {
	AuthorizeOptions,
	Challenge,
	Client,
	ExchangeSuccess,
	RefreshSuccess,
} from "@kagii/openauth/client";
import { createSubjects } from "@kagii/openauth/subject";
import type { InferOutput } from "valibot";
import * as v from "valibot";
import {
	type GetUserListFilters,
	UserListSchemaValidation,
	type UserResponseSchemaInferdType,
	type UserResponseSchemaType,
} from "../database/endpoints";
import type { OTFUsersParsedType } from "../database/schema";
import { createClient } from ".";
import OpenAuthsterErrors, { type ErrorList } from "./errors";
import { MFAmanager } from "./mfa";
import { Passkey } from "./passkey";

export const userEndpointURI = "/session" as const;

export type FlowTypes = "invite" | "qr" | "passkey";

export const UserEndpointValidation = v.object({
	type: v.union([v.literal("public"), v.literal("private")]),
	data: v.optional(v.any()),
	client_id: v.string(),
});

export const defaultSubjectSchema = createSubjects({
	user: v.object({
		id: v.string(),
		identifier: v.string(),
		role: v.nullable(v.string()),
		data: v.any(),
		clientID: v.string(),
		provider: v.string(),
	}),
});

export type RequestData = InferOutput<typeof UserEndpointValidation>;

export const UserEndpointResponseValidation = v.object({
	success: v.boolean(),
	data: v.optional(
		v.object({
			public: v.nullable(v.looseObject({})),
			private: v.nullable(v.looseObject({})),
			user_id: v.string(),
			user_identifier: v.string(),
			userInfo: v.looseObject({
				provider: v.string(),
			}),
		}),
	),
	error: v.optional(v.string()),
});
export type UserFetchResponse<
	PublicSessionData = unknown,
	PrivateSessionData = unknown,
> = {
	success: boolean;
	data?: {
		private: PrivateSessionData;
		public: PublicSessionData;
		user_id: string;
		user_identifier: string;
	};
	error?: string;
};

export type ResponseData = InferOutput<typeof UserEndpointResponseValidation>;

export type UpdateUserByIdData<
	Public extends Record<string, unknown> | null,
	Private extends Record<string, unknown> | null,
> = Partial<
	Omit<OTFUsersParsedType<Public, Private>, "created_at" | "id" | "identifier">
>;

export type OpenAuthsterOptions = {
	secret?: string;
};

type AuthFlowCallbacks<
	Public extends RequiredResponseData["public"],
	Private extends RequiredResponseData["private"],
> = {
	/**
	 * Event triggered when the QR authentication flow is initiated. This can be used to perform a security mesure to verify that the user ia aware of the login attempt, for example by displaying a notification or requiring a confirmation before proceeding with the authentication process.
	 * @returns true for prceeding with the authentication flow, false to abort. Can also return a Promise resolving to true or false for asynchronous operations.
	 */
	onQRAuthFlowStart: (
		client: OpenAuthsterClient<Public, Private>,
	) => boolean | Promise<boolean>;
	/**
	 * Event triggered when the token is expired and a refresh attempt as failed.
	 *
	 * The callback must return true for redirecting the user to the login page, false to manage it yourself.
	 */
	onLoginRequired: (client: OpenAuthsterClient<Public, Private>) => void;
};

export type ClientProps<
	PublicSessionData extends RequiredResponseData["public"],
	PrivateSessionData extends RequiredResponseData["private"],
> = {
	issuerURI: string;
	clientID: string;
	token?: string | null;
	refreshToken?: string | null;
	redirectURI: string;
	/**
	 * Server side ONLY !! but necessary for private user session `get/update`
	 */
	secret?: string;
	/**
	 * Schema for validating the subject of incoming tokens from requests.
	 *
	 * Required for using `getTokenFromRequest` and `setTokenFromRequest` methods, as the client will attempt to verify incoming tokens using this schema. If verification fails, the token will be rejected and an error will be logged in the console. This is a security measure to prevent unauthorized access with invalid tokens.
	 *
	 * if not provided, the default OpenAuthSter subject schema will be used. However, if your issuer uses a custom subject format or you want to enforce specific claims in the subject, you should provide a custom schema here.
	 *
	 * **Server side only.**
	 */
	subject?: typeof defaultSubjectSchema;
	authFlowCallbacks?: Partial<
		AuthFlowCallbacks<PublicSessionData, PrivateSessionData>
	>;
	onError?: (err: ErrorList) => void;
} & OpenAuthsterOptions;

export type USerMetaData = {
	user_id: string | null;
	user_identifier: string | null;
};

type RequiredResponseData = Exclude<ResponseData["data"], undefined>;

type ErrorType = {
	error: string;
	error_description: string | null;
};

type CallbackType<
	PublicSessionData extends RequiredResponseData["public"] = Record<
		string,
		unknown
	>,
	PrivateSessionData extends RequiredResponseData["private"] = Record<
		string,
		unknown
	>,
	UserInfo extends RequiredResponseData["userInfo"] = { provider: string },
> = (
	client: OpenAuthsterClient<PublicSessionData, PrivateSessionData, UserInfo>,
	error?: ErrorType,
) => void | Promise<void>;

/**
 * OpenAuthsterClient is a client library for interacting with an OpenAuthSter Issuer, providing methods for authentication, session management, and user data fetching/updating. It supports both browser and server environments, with specific methods for handling tokens from incoming requests on the server side. The client manages authentication state, session data, and provides a simple interface for making authenticated requests to protected endpoints. It also includes functionality for automatically refreshing tokens before they expire to maintain an active session.
 *
 * @typeParam PublicSessionData - The type of the public session data. Defaults to `any`.
 * @typeParam PrivateSessionData - The type of the private session data. Defaults to `any`.
 * @typeParam UserInfo - The type of the user info data returned by the provider depending on the scopes you setted. Defaults to `any`.
 */
export class OpenAuthsterClient<
	PublicSessionData extends RequiredResponseData["public"] = Record<
		string,
		unknown
	>,
	PrivateSessionData extends RequiredResponseData["private"] = Record<
		string,
		unknown
	>,
	UserInfo extends RequiredResponseData["userInfo"] = { provider: string },
> {
	public openAuthClient: Client;
	public expiresAt: Date | null = null;
	public isLoaded: boolean = false;
	public isAuthenticated: boolean = false;
	public data: {
		public: PublicSessionData;
		private: PrivateSessionData;
	} = {
		public: {} as PublicSessionData,
		private: {} as PrivateSessionData,
	};
	public userMeta: USerMetaData = {
		user_id: null,
		user_identifier: null,
	};
	public userInfo: UserInfo | null = null;
	public error: { error: string; error_description: string | null } | null =
		null;

	private issuerURI: string;
	private clientID: string;
	private secret?: string;
	private token: string | null = null;
	private refreshToken: string | null = null;
	private redirectURI: string;
	private refreshTimer: Timer | undefined;
	private initListeners: Map<
		string,
		CallbackType<PublicSessionData, PrivateSessionData, UserInfo>
	> = new Map();
	private subject: typeof defaultSubjectSchema = defaultSubjectSchema;
	private authFlowCallbacks: Partial<
		AuthFlowCallbacks<PublicSessionData, PrivateSessionData>
	>;
	private onError?: (err: ErrorList) => void;
	public mfa: MFAmanager;
	public passkey: Passkey;

	constructor(props: ClientProps<PublicSessionData, PrivateSessionData>) {
		this.verifyProps(props);
		this.issuerURI = props.issuerURI;
		this.openAuthClient = createClient({
			clientID: props.clientID,
			issuer: props.issuerURI,
		});
		this.secret = props.secret;
		this.token = props.token ?? this.getStoredToken();
		this.refreshToken = props.refreshToken ?? this.getStoredRefreshToken();
		this.clientID = props.clientID;
		this.redirectURI = props.redirectURI;
		if (props.subject) {
			this.subject = props.subject as typeof defaultSubjectSchema;
		}
		this.authFlowCallbacks = props.authFlowCallbacks ?? {};
		this.onError = props.onError;
		this.mfa = new MFAmanager({
			issuerURI: this.issuerURI,
			fetch: this.fetch.bind(this) as typeof fetch,
			onError: this.onError ?? (() => {}),
		});
		this.passkey = new Passkey(this.issuerURI, this as OpenAuthsterClient);
	}
	/**
	 * Trigger client initialization. Must be called after the first page load, for SSR compatibility.
	 *
	 * **Browser Only**
	 * @example
	 * ```ts
	 * // React example
	 * const [openAuthsterClient] = useState(() =>
	 *   createOpenAuthsterClient({
	 *     issuerURI: "https://your-issuer.com",
	 *     clientID: "your-client-id",
	 *     redirectURI: "https://your-app.com/callback",
	 *   }),
	 * );
	 * const [isInitialized, setIsInitialized] = useState(false);
	 * useEffect(() => {
	 *   openAuthsterClient.init().then(() => {
	 *     setIsInitialized(true);
	 *   });
	 * }, []);
	 * ```
	 */
	async init() {
		return this._init()
			.then(this.triggerUpdate.bind(this))
			.then(() => this);
	}
	/**
	 * Notifies all registered initialization listeners of the current client state. Use this to manually trigger a re-render or data refresh in components that track auth state.
	 *
	 * **Browser Only**
	 * @example
	 * ```ts
	 * // React example — listen for client state changes
	 * useEffect(() => {
	 *   const onUpdate = (client: OpenAuthsterClient, error?: { error: string; error_description: string | null }) => {
	 *     // handle updated auth state
	 *   };
	 *   openAuthsterClient.addInitializationListener("myComponent", onUpdate);
	 *   return () => openAuthsterClient.removeInitializationListener("myComponent");
	 * }, []);
	 * ```
	 */
	triggerUpdate() {
		return Promise.all(
			this.initListeners
				.values()
				.map((callback) => callback(this, this.error || undefined)),
		) as unknown as Promise<void>;
	}
	/**
	 * Fetches the authenticated user's session data. Pass `"public"` for public data or `"private"` for server-only private data (requires `secret`).
	 *
	 * **`Client or Server Side`** — on the server, call `setTokenFromRequest` first.
	 *
	 * @param type - `"public"` or `"private"`.
	 */
	getUserSession(type: RequestData["type"]) {
		this.ensureReady();
		return this.fetchWithOptions(`${this.issuerURI}/session/${type}`, {
			method: "GET",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserFetchResponse<PublicSessionData, PrivateSessionData>
					>,
			)
			.then((_json) =>
				this.parseResponseData(v.parse(UserEndpointResponseValidation, _json)),
			)
			.catch((err) => {
				console.error(`Failed to fetch user session: ${err.message}`);
				return new Error(`Failed to fetch user session: ${err.message}`);
			});
	}
	/**
	 * Merges the provided `data` into the user's session (PATCH semantics). Pass `"public"` or `"private"` to target the respective store. Updating `"private"` requires `secret` to be set.
	 *
	 * **`Client or Server Side`** — on the server, call `setTokenFromRequest` first.
	 *
	 * @param type - `"public"` or `"private"`.
	 * @param data - Partial session data to merge in.
	 */
	updateUserSession<SessionData extends PublicSessionData | PrivateSessionData>(
		type: RequestData["type"],
		data: Partial<SessionData>,
	) {
		this.ensureReady();

		return this.fetchWithOptions(`${this.issuerURI}/session/${type}`, {
			method: "PATCH",
			body: JSON.stringify(data),
			headers: {
				"Content-Type": "application/json",
			},
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserFetchResponse<PublicSessionData, PrivateSessionData>
					>,
			)
			.then((_json) =>
				this.parseResponseData(v.parse(UserEndpointResponseValidation, _json)),
			)
			.catch(
				(err) => new Error(`Failed to update user session: ${err.message}`),
			);
	}

	/**
	 * Initiates the login flow by generating a PKCE challenge and redirecting the user to the authorization URL.
	 *
	 * After the user authenticates, they will be redirected to `redirectURI`. Call `callback()` on that page to complete the exchange.
	 *
	 * **Browser Only**
	 *
	 * @param options - Optional authorization options.
	 *   - `autoNavigate` (default `true`): set to `false` to get the URL without redirecting.
	 *   - `copyID`: display the login UI with a copy template
	 * @returns The authorization URL the user is being redirected to.
	 */
	async login(
		options?: AuthorizeOptions & { autoNavigate?: boolean; copyID?: string },
	): Promise<string> {
		const { autoNavigate = true, ...authorizedOptions } = options || {};

		return this.openAuthClient
			.authorize(this.redirectURI, "code", authorizedOptions)
			.then((e) => {
				this.setChallenge(e.challenge);
				const authURL = new URL(e.url);
				const currentURI = new URL(window.location.href);
				const inviteId = currentURI.searchParams.get("invite_id");
				inviteId && authURL.searchParams.set("invite_id", inviteId);
				const copyID = authorizedOptions.copyID;
				copyID && authURL.searchParams.set("copy_id", copyID);
				if (autoNavigate) {
					window.location.href = authURL.toString();
				}
				return authURL.toString();
			});
	}

	/**
	 * Clears all tokens, session data, and authentication state, then notifies all registered listeners.
	 *
	 * Removes `oa_token`, `oa_refresh_token`, `oa_challenge`, and `oa_expires_at` from localStorage. The user must log in again to obtain new tokens.
	 *
	 * **Browser Only**
	 */
	logout() {
		this.token = null;
		this.refreshToken = null;
		this.expiresAt = null;
		this.clearRefreshTimer();
		this.removeToken();
		this.removeRefreshToken();
		this.removeChallenge();
		this.removeStoredExpiresAt();
		this.isAuthenticated = false;
		this.isLoaded = true;
		this.data = {
			public: {} as PublicSessionData,
			private: {} as PrivateSessionData,
		};
		return this.triggerUpdate();
	}

	/**
	 * Completes the OAuth authorization flow by exchanging the authorization code in the current URL for access and refresh tokens.
	 *
	 * Call this on your redirect/callback page immediately after the user is sent back from the authorization server. Cleans up the `code` and `state` query params from the URL after a successful exchange.
	 *
	 * **Browser Only**
	 */
	async callback() {
		const challenge = this.getChallenge();
		const code = this.getCode();

		if (!code) return;
		if (!challenge) {
			return Promise.reject(
				new OpenAuthsterErrors.CallbackError("No challenge found in storage."),
			);
		}
		this.removeRefreshToken();
		this.removeToken();
		await this.openAuthClient
			.exchange(code, this.redirectURI, challenge.verifier)
			.then((tokens) => {
				if (tokens.err) throw tokens.err;
				this.updateTokens(tokens);
				this.isAuthenticated = true;
			})
			.catch((err) => {
				console.error("Error during callback exchange: ", err);
				this.triggerError(
					new OpenAuthsterErrors.CallbackError(
						`Error during callback exchange: ${err.message}`,
						err,
					),
				);
			})
			.finally(() => {
				this.removeChallenge();
				location.search = location.search
					.replace(/([?&])code=[^&]*&?/, "$1")
					.replace(/([?&])state=[^&]*&?/, "$1")
					.replace(/&$/, "")
					.replace(/^\?&/, "?");
			});
	}

	/**
	 * Updates runtime client options. Currently supports updating `secret`, which is required for accessing private session data and admin endpoints.
	 *
	 * @param options - Options to update.
	 */
	updateOptions(options: OpenAuthsterOptions) {
		if (options.secret) {
			this.secret = options.secret;
		}
	}

	/**
	 * Registers a callback invoked whenever the client state changes (auth, session data). Use a unique `key` to identify the listener so it can be removed later.
	 *
	 * **`Browser Only`**
	 * @example
	 * ```ts
	 * // React example of a component listening for updates
	 * useEffect(() => {
	 *   const updateData = (client: OpenAuthsterClient) => {
	 *     // Fetch new data or trigger re-render
	 *   };
	 *   openAuthsterClient.addInitializationListener("myComponent", updateData);
	 *   return () => {
	 *     // Cleanup listener on unmount if needed
	 *     openAuthsterClient.removeInitializationListener("myComponent");
	 *   };
	 * }, []);
	 * ```
	 */
	addInitializationListener(
		key: string,
		callback: CallbackType<PublicSessionData, PrivateSessionData, UserInfo>,
	) {
		this.initListeners.set(key, callback);
	}
	/**
	 * Removes a previously registered listener by key. The listener will no longer be called on client state changes.
	 */
	removeInitializationListener(key: string) {
		this.initListeners.delete(key);
	}
	/**
	 * Extracts the Bearer token from the `Authorization` header of an incoming `Request`, falling back to the `access_token` cookie. Returns `null` if neither is present.
	 *
	 * **`Server Side Only`**
	 */
	getTokenFromRequest(request: Request): string | null {
		const authHeader = request.headers.get("Authorization");
		if (authHeader?.startsWith("Bearer ")) {
			return authHeader.substring(7); // Remove "Bearer " prefix
		}
		const tokenFromCookie = request.headers
			.get("Cookie")
			?.split(";")
			.find((cookie) => cookie.trim().startsWith("access_token="))
			?.replace(/^\s*access_token=/, "")
			?.trim();

		return tokenFromCookie || null;
	}
	/**
	 * Writes the current access token into a browser cookie (`access_token`). After calling this, server-side middleware can read the token via `getTokenFromRequest`.
	 *
	 * **`Browser Side Only`**
	 */
	setTokenToCookie() {
		if (typeof window === "undefined" || !this.token)
			throw new Error(
				"Cannot set token to cookie: document is undefined or token is null",
			);
		document.cookie = `access_token=${this.token}; path=/; secure; samesite=lax;`;
	}

	/**
	 * Sets the client's token from the `Authorization: Bearer` header (or `access_token` cookie) of an incoming `Request`. Verifies the token using the configured subject schema before accepting it — invalid tokens are rejected and `isAuthenticated` is set to `false`.
	 *
	 * **`Server side only`**
	 *
	 * @example
	 * ```ts
	 * const client = new OpenAuthsterClient({
	 *   issuerURI: "https://your-issuer.com",
	 *   clientID: "your-client-id",
	 *   secret: "your-client-secret",
	 *   redirectURI: "https://your-app.com/",
	 * });
	 *
	 * async function handleRequest(request: Request) {
	 *   await client.setTokenFromRequest(request);
	 *   if (client.isAuthenticated) {
	 *     // proceed with authenticated logic
	 *   }
	 * }
	 * ```
	 */
	setTokenFromRequest(request: Request): Promise<this> {
		const token = this.getTokenFromRequest(request);
		if (!token) {
			this.token = null;
			this.isAuthenticated = false;
			return Promise.resolve(this);
		}
		return this.verifyToken(token).then((res) => {
			if (res.err) {
				throw new Error("Failed to verify token from request.", {
					cause: res.err,
				});
			}
			if (token) {
				this.token = token;
				this.isAuthenticated = true;
			}
			return this;
		});
	}

	/**
	 * Authenticated fetch wrapper. Adds Bearer token (and secret HMAC headers if configured), but does **not** append `client_id` to the URL.
	 *
	 * Use `fetchWithOptions` directly if you need `client_id` appended automatically.
	 *
	 * **`Client or Server Side`**
	 */
	async fetch(input: RequestInfo, init?: RequestInit) {
		return this.fetchWithOptions(input, init, { noClientId: true });
	}

	/**
	 * Authenticated fetch wrapper that appends `client_id` as a query param and injects Bearer token + HMAC secret headers (`X-Client-Timestamp`, `X-Client-Signature`) when configured.
	 *
	 * **`Client or Server Side`** — on the server, call `setTokenFromRequest` first.
	 */
	async fetchWithOptions(
		input: RequestInfo,
		init?: RequestInit,
		options?: { noClientId: boolean },
	) {
		const isRequest = typeof input !== "string";
		const inputUrl = isRequest ? input.url : input;
		const { noClientId = false } = options || {};

		// Only use a base for relative URLs; absolute URLs are left as-is
		const isAbsolute =
			inputUrl.startsWith("http://") || inputUrl.startsWith("https://");
		const base = isAbsolute
			? undefined
			: typeof globalThis.window !== "undefined"
				? globalThis.window.location.origin
				: this.issuerURI;

		const url = new URL(inputUrl, base);
		if (!noClientId) {
			url.searchParams.set("client_id", this.clientID);
		}

		// Build merged headers with proper priority:
		// Request headers (lowest) → auth headers → init headers (highest)
		const mergedHeaders = new Headers();

		// 1. Preserve headers from original Request object
		if (isRequest && input.headers) {
			new Headers(input.headers).forEach((value, key) => {
				mergedHeaders.set(key, value);
			});
		}

		// 2. Set authentication headers
		if (this.token) {
			mergedHeaders.set("Authorization", `Bearer ${this.token}`);
		}
		if (this.secret) {
			const timestamp = Math.floor(Date.now() / 1000).toString();
			const signature = await this.generateSignature(timestamp);

			mergedHeaders.set("X-Client-Timestamp", timestamp);
			mergedHeaders.set("X-Client-Signature", signature);
		}

		// 3. Apply caller-provided headers (highest priority)
		if (init?.headers) {
			new Headers(init.headers).forEach((value, key) => {
				mergedHeaders.set(key, value);
			});
		}

		// When input is a Request, preserve its properties (method, body, etc.)
		// unless explicitly overridden by init
		const requestDefaults: RequestInit = isRequest
			? {
					method: input.method,
					body: input.body,
					credentials: input.credentials,
					cache: input.cache,
					redirect: input.redirect,
					referrer: input.referrer,
					integrity: input.integrity,
					keepalive: input.keepalive,
					signal: input.signal,
				}
			: {};

		const authInit: RequestInit = {
			...requestDefaults,
			...init,
			headers: mergedHeaders,
		};

		return fetch(url.toString(), authInit);
	}
	/**
	 * Resets the user's public session data to an empty object (DELETE, not a merge).
	 *
	 * **`Client or Server Side`**
	 */
	clearPublicSession() {
		return this.fetchWithOptions(`${this.issuerURI}/session/public`, {
			method: "DELETE",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserFetchResponse<PublicSessionData, PrivateSessionData>
					>,
			)
			.then((_json) =>
				this.parseResponseData(v.parse(UserEndpointResponseValidation, _json)),
			)
			.catch(
				(err) => new Error(`Failed to clear public session: ${err.message}`),
			);
	}
	/**
	 * Resets the user's private session data to an empty object (DELETE, not a merge). Requires `secret` to be set.
	 *
	 * **`Server Side Only`**
	 */
	clearPrivateSession() {
		return this.fetchWithOptions(`${this.issuerURI}/session/private`, {
			method: "DELETE",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserFetchResponse<PublicSessionData, PrivateSessionData>
					>,
			)
			.then((_json) =>
				this.parseResponseData(v.parse(UserEndpointResponseValidation, _json)),
			)
			.catch(
				(err) => new Error(`Failed to clear private session: ${err.message}`),
			);
	}

	/**
	 * Fetches a single user by their ID from the issuer's user endpoint.
	 *
	 * **`Requires secret to be set.`**
	 */
	getUserById(
		user_id: string,
	): Promise<
		| UserResponseSchemaInferdType<
				PublicSessionData,
				PrivateSessionData,
				UserInfo
		  >
		| Error
	> {
		return this.fetchWithOptions(`${this.issuerURI}/user/${user_id}`, {
			method: "GET",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserResponseSchemaInferdType<
							PublicSessionData,
							PrivateSessionData,
							UserInfo
						>
					>,
			)
			.then(
				(_json) =>
					v.parse(
						UserListSchemaValidation,
						_json,
					) as UserResponseSchemaInferdType<
						PublicSessionData,
						PrivateSessionData,
						UserInfo
					>,
			)
			.catch((err) => new Error(`Failed to fetch user by ID: ${err.message}`));
	}
	/**
	 * Fetches multiple users by their IDs in a single request.
	 *
	 * **`Requires secret to be set.`**
	 *
	 * @param ids - Array of user IDs to fetch.
	 */
	getManyUserById(ids: string[]) {
		const url = new URL(`${this.issuerURI}/users/specific`);
		ids.forEach((id) => {
			url.searchParams.append("user_id", id);
		});
		return this.fetchWithOptions(url.toString(), {
			method: "GET",
		})
			.then((res) => res.json() as Promise<UserResponseSchemaType>)
			.then(
				(_json) =>
					v.parse(
						UserListSchemaValidation,
						_json,
					) as UserResponseSchemaInferdType<
						PublicSessionData,
						PrivateSessionData,
						UserInfo
					>,
			)
			.catch(
				(err) => new Error(`Failed to fetch users by IDs: ${err.message}`),
			);
	}
	/**
	 * Fetches a paginated list of users for this project from the issuer's user endpoint.
	 *
	 * **`Requires secret to be set.`**
	 *
	 * @param filters - Optional pagination filters (`page`, `limit`).
	 */
	getUsers(
		filters?: GetUserListFilters,
	): Promise<
		| UserResponseSchemaInferdType<
				PublicSessionData,
				PrivateSessionData,
				UserInfo
		  >
		| Error
	> {
		const url = new URL(`${this.issuerURI}/users`);
		if (filters?.page) url.searchParams.set("page", filters.page.toString());
		if (filters?.limit) url.searchParams.set("limit", filters.limit.toString());
		return this.fetchWithOptions(url.toString(), {
			method: "GET",
		})
			.then((res) => res.json() as Promise<UserResponseSchemaType>)
			.then(
				(_json) =>
					v.parse(
						UserListSchemaValidation,
						_json,
					) as UserResponseSchemaInferdType<
						PublicSessionData,
						PrivateSessionData,
						UserInfo
					>,
			)
			.catch((err) => new Error(`Failed to fetch users: ${err.message}`));
	}
	/**
	 * Deletes a user by their ID.
	 *
	 * **`Requires secret to be set.`**
	 *
	 * @param user_id - The ID of the user to delete.
	 */
	deleteUserById(
		user_id: string,
	): Promise<{ success: boolean; error: null | string }> {
		return this.fetchWithOptions(`${this.issuerURI}/user/${user_id}`, {
			method: "DELETE",
		})
			.then((res) => res.json() as Promise<UserResponseSchemaType>)
			.then((json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to delete user.");
				}
				return { success: true, error: null };
			})
			.catch((err) => ({
				success: false,
				error: `Failed to delete user by ID: ${err.message}`,
			}));
	}
	/**
	 * Updates a user's record by their ID. Only the fields provided in `data` will be updated; omitted fields are left unchanged.
	 *
	 * **`Requires secret to be set.`**
	 *
	 * @param user_id - The ID of the user to update.
	 * @param data - Partial user fields to update. `id`, `identifier`, and `created_at` cannot be changed.
	 */
	updateUserById(
		user_id: string,
		data: UpdateUserByIdData<PublicSessionData, PrivateSessionData>,
	): Promise<UserResponseSchemaType["data"] | Error> {
		return this.fetchWithOptions(`${this.issuerURI}/user/${user_id}`, {
			method: "PUT",
			body: JSON.stringify(data),
			headers: {
				"Content-Type": "application/json",
			},
		})
			.then((res) => res.json() as Promise<UserResponseSchemaType>)
			.then((json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to update user.");
				}
				return json.data;
			})
			.catch((err) => new Error(`Failed to update user by ID: ${err.message}`));
	}

	/**
	 * Returns the current access token, falling back to the value stored in localStorage. Returns `null` if no token is available.
	 */
	getToken() {
		return this.token || this.getStoredToken();
	}
	/**
	 * Returns lightweight metadata for the current user (`id`, `identifier`, `provider`)
	 * by verifying the token and extracting its subject claims, without loading session blobs.
	 * Useful for lightweight presence checks.
	 *
	 * **`Client or Server Side`**
	 */
	async getMetaData<
		UserData extends Record<string, unknown> = Record<string, unknown>,
	>(): Promise<{
		id: string;
		identifier: string;
		provider: string;
		data: UserData;
	} | null> {
		const token = this.getToken();
		if (!token) return null;
		const result = await this.verifyToken(token);
		if (result.err || !result.subject) return null;
		const props = result.subject.properties;
		return {
			id: props?.id ?? null,
			identifier: props?.identifier ?? null,
			provider: props?.provider ?? null,
			data: props?.data as UserData,
		};
	}
	/**
	 * - **Provide a token directly**: ensure it is valid
	 *
	 * - **No token provided**: verify the current client token and update authentication state accordingly. If verification fails, the token will be rejected and an error will be logged in the console. This is a security measure to prevent unauthorized access with invalid tokens.
	 *
	 * @returns `true` if valid, `false` if verification fails.
	 *
	 * **`Client or Server Side`**
	 */
	verify(token?: string) {
		const tokenToVerify = token || this.token;
		if (!tokenToVerify) {
			return Promise.reject(new Error("No token available for verification."));
		}
		return this.verifyToken(tokenToVerify)
			.then((res) => {
				if (res.err) {
					console.error("Failed to verify token.", res.err);
					return false;
				}
				if (this.token) {
					this.isAuthenticated = true;
				}
				return true;
			})
			.catch((err) => {
				console.error(err);
			});
	}

	/**
	 * Attempts to refresh the access token using the stored refresh token. Retries up to 3 times with exponential backoff (2 s, 4 s, 6 s). Returns `true` on success, `false` if all attempts fail (which triggers logout or `onLoginRequired`).
	 *
	 * **`Client Side`**
	 */
	async triggerRefresh(): Promise<boolean> {
		const refreshToken = this.refreshToken || this.getStoredRefreshToken();
		let count = 0;
		if (!refreshToken) return Promise.resolve(false);
		const refresher = async () => {
			try {
				const refreshResult = await this.openAuthClient.refresh(refreshToken);
				if (refreshResult.err) throw refreshResult.err;
				this.updateTokens(refreshResult);
				return true;
			} catch (err) {
				console.error("Token refresh failed:", err);
				return false;
			}
		};

		const attemptRefresh = async (): Promise<boolean> => {
			return refresher().then((success) => {
				if (!success && count < 3) {
					count++;
					const retryDelay = 2000 * count; // Exponential backoff: 2s, 4s, 6s
					console.warn(
						`Retrying token refresh in ${retryDelay / 1000} seconds...`,
					);
					return new Promise((resolve) => setTimeout(resolve, retryDelay)).then(
						attemptRefresh,
					);
				}
				return success;
			});
		};

		return attemptRefresh().then((success) => {
			if (!success) {
				if (this.authFlowCallbacks.onLoginRequired) {
					this.authFlowCallbacks.onLoginRequired(this);
				} else {
					this.logout();
				}
			}
			return success;
		});
	}

	private verifyToken(token: string) {
		return this.openAuthClient.verify<typeof defaultSubjectSchema>(
			this.subject,
			token,
		);
	}

	private async _init() {
		const url = new URLSearchParams(window.location.search);
		const error = url.get("error");
		const error_description = url.get("error_description");
		const inviteFlow = url.get("invite_id");
		const flow = url.get("flow") as FlowTypes | null;

		if (error) {
			this.handleAuthError(error, error_description);
		} else if (this.getCode()) {
			await this.callback();
		} else {
			await this.restoreSession();
		}

		if (flow === "qr") {
			await this.QRauthFlowCallback(url.get("id"));
		} else if (inviteFlow) {
			return this.login({
				autoNavigate: true,
			});
		} else if (flow === "passkey") {
			return this.passkey.flowCallback();
		}

		this.isLoaded = true;
	}

	private handleAuthError(error: string, error_description: string | null) {
		console.error("Error from authorization callback: ", {
			error,
			error_description,
		});
		this.error = { error, error_description };
	}

	private async restoreSession() {
		this.token = this.getStoredToken();
		this.refreshToken = this.getStoredRefreshToken();
		this.expiresAt = this.getStoredExpiresAt();

		if (this.expiresAt && this.expiresAt < new Date()) {
			const refreshed = await this.triggerRefresh();
			if (!refreshed) {
				this.authFlowCallbacks.onLoginRequired?.(this);
				return;
			} else {
				this.createResetTimer(this.expiresAt.getTime() - Date.now());
			}
		} else if (this.expiresAt) {
			this.createResetTimer(this.expiresAt.getTime() - Date.now());
		}

		if (this.token) {
			this.isAuthenticated = true;
		}
	}

	private async QRauthFlowCallback(id: string | null) {
		if (
			this.authFlowCallbacks.onQRAuthFlowStart &&
			!(await this.authFlowCallbacks.onQRAuthFlowStart(this))
		)
			return;

		if (!this.getStoredToken()) return this.login();
		if (!id) {
			this.error = {
				error: "missing_qr_validation_id",
				error_description: "No QR validation ID provided in URL.",
			};
			return this.triggerRefresh();
		}
		const _url = new URL(`${this.issuerURI}/qr/validate`);
		_url.searchParams.set("id", id);

		return this.fetchWithOptions(_url.toString(), {
			method: "POST",
		});
	}

	private ensureReady() {
		if (!this.token) {
			throw new Error("Client is not authenticated. Token is missing.");
		}
	}

	private parseResponseData(data: ResponseData): {
		public: PublicSessionData;
		private: PrivateSessionData;
		user_id: string;
		user_identifier: string;
		userInfo: UserInfo;
	} {
		if (!data.success || !data.data)
			throw new Error(data.error || "Failed to fetch user session data.");

		if (data.data.private)
			this.data.private = data.data.private as PrivateSessionData;
		if (data.data.public)
			this.data.public = data.data.public as PublicSessionData;
		if (data.data.user_id) this.userMeta.user_id = data.data.user_id;
		if (data.data.user_identifier)
			this.userMeta.user_identifier = data.data.user_identifier;
		if (data.data.userInfo) this.userInfo = data.data.userInfo as UserInfo;
		return data.data as {
			public: PublicSessionData;
			private: PrivateSessionData;
			user_id: string;
			user_identifier: string;
			userInfo: UserInfo;
		};
	}

	/**
	 * expiresIn must be in Ms
	 */
	private createResetTimer(expiresInMs: number | null) {
		if (!expiresInMs) return;
		clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(this.triggerRefresh.bind(this), expiresInMs);
	}

	private updateTokens(tokens: ExchangeSuccess | RefreshSuccess) {
		if (tokens.tokens?.access) {
			this.token = tokens.tokens?.access;
			this.storeToken(tokens.tokens.access);
			if (tokens.tokens?.expiresIn) {
				const expTimeStamp = tokens.tokens?.expiresIn * 1000 + Date.now();
				this.expiresAt = new Date(expTimeStamp);
				this.storeExpiresAt(expTimeStamp);
			}
		}
		if (tokens.tokens?.refresh) {
			this.refreshToken = tokens.tokens.refresh;
			this.storeRefreshToken(tokens.tokens.refresh);
		}
	}

	private clearRefreshTimer() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	private getCode(): string | null {
		const params = new URLSearchParams(window.location.search);
		return params.get("code");
	}

	private setChallenge(challenge: Challenge) {
		localStorage.setItem("oa_challenge", JSON.stringify(challenge));
	}
	private getChallenge(): Challenge | null {
		const challenge = localStorage.getItem("oa_challenge");
		return challenge ? JSON.parse(challenge) : null;
	}
	private removeChallenge() {
		localStorage.removeItem("oa_challenge");
	}

	private getStoredToken(): string | null {
		return typeof window !== "undefined"
			? localStorage.getItem("oa_token")
			: null;
	}
	private storeToken(token: string) {
		if (typeof window !== "undefined") {
			localStorage.setItem("oa_token", token);
		}
	}
	private removeToken() {
		if (typeof window !== "undefined") {
			localStorage.removeItem("oa_token");
		}
	}
	private getStoredRefreshToken(): string | null {
		return typeof window !== "undefined"
			? localStorage.getItem("oa_refresh_token")
			: null;
	}
	private storeRefreshToken(refreshToken: string) {
		if (typeof window !== "undefined") {
			localStorage.setItem("oa_refresh_token", refreshToken);
		}
	}
	private removeRefreshToken() {
		if (typeof window !== "undefined") {
			localStorage.removeItem("oa_refresh_token");
		}
	}

	/**
	 * Retrives the timeStamp exiresAt from local storage. This is used to determine when the token expires and when to attempt refreshes. If the client is closed and reopened, it will check the stored expiration time to determine if the token is still valid or if it needs to be refreshed immediately.
	 *
	 * **Browser Only**
	 * @returns The expiration time as a timestamp in milliseconds, or null if not found or invalid.
	 */
	private getStoredExpiresAt(): Date | null {
		const stored =
			typeof window !== "undefined"
				? localStorage.getItem("oa_expires_at")
				: null;
		if (!stored) return null;
		const expiresAt = parseInt(stored, 10);
		return Number.isNaN(expiresAt) ? null : new Date(expiresAt);
	}
	/**
	 * Store the expiration time as a timestamp in milliseconds in local storage. The client will use this to determine when to attempt token refreshes. If the client is closed and reopened, it will check the stored expiration time to determine if the token is still valid or if it needs to be refreshed immediately.
	 *
	 * **Browser Only**
	 */
	private storeExpiresAt(expiresAt: number) {
		if (typeof window === "undefined") return;
		localStorage.setItem("oa_expires_at", expiresAt.toString());
	}
	private removeStoredExpiresAt() {
		if (typeof window === "undefined") return;
		localStorage.removeItem("oa_expires_at");
	}
	private triggerError(err: ErrorList) {
		this.onError?.(err);
		throw err;
	}
	/**
	 * Helper interne pour générer la signature HMAC
	 */
	private async generateSignature(timestamp: string): Promise<string> {
		const encoder = new TextEncoder();
		const keyData = encoder.encode(this.secret);
		const messageData = encoder.encode(`${timestamp}:${this.clientID}`);

		// Importation de la clé pour HMAC
		const key = await crypto.subtle.importKey(
			"raw",
			keyData,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);

		// Génération de la signature
		const signature = await crypto.subtle.sign("HMAC", key, messageData);

		// Conversion en Hexadécimal
		return Array.from(new Uint8Array(signature))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}
	private verifyProps(
		props: ClientProps<PublicSessionData, PrivateSessionData>,
	) {
		if (!props.issuerURI.startsWith("http")) {
			throw new Error("Invalid issuer URI. Must start with http or https.");
		}
		if (props.secret && typeof window !== "undefined") {
			console.warn(
				"Warning: Initializing client with a secret in a browser environment can lead to security risks. Make sure to only use secrets in server-side environments.",
			);
		}
	}
}

/**
 * Factory function to create an instance of the OpenAuthsterClient with specified session data types.
 *
 * @typeParam PublicSessionData - The type of the public session data. Defaults to `any`.
 * @typeParam PrivateSessionData - The type of the private session data. Defaults to `any`.
 * @typeParam UserInfo - The type of the user info data returned by the provider depending on the scopes you setted. Defaults to `any`.
 */
export function createOpenAuthsterClient<
	PublicSessionData extends RequiredResponseData["public"] = Record<
		string,
		unknown
	>,
	PrivateSessionData extends RequiredResponseData["private"] = Record<
		string,
		unknown
	>,
	UserInfo extends RequiredResponseData["userInfo"] = {
		provider: string;
	},
>(
	props: ClientProps<PublicSessionData, PrivateSessionData>,
): OpenAuthsterClient<PublicSessionData, PrivateSessionData, UserInfo> {
	return new OpenAuthsterClient<
		PublicSessionData,
		PrivateSessionData,
		UserInfo
	>(props);
}
