import type {
	AuthorizeOptions,
	Challenge,
	Client,
	ExchangeSuccess,
	RefreshSuccess,
} from "@kagii/openauth/client";
import { createSubjects } from "@kagii/openauth/subject";
import type { JWTPayload } from "jose";
import type { ProviderType } from "openauth-webui-shared-types";
import type { InferOutput } from "valibot";
import * as v from "valibot";
import {
	type GetUserListFilters,
	UserListSchemaValidation,
	type UserResponseSchemaInferdType,
	type UserResponseSchemaType,
} from "../database/endpoints";
import type { OTFUsersParsedType } from "../database/schema";
import type { QRProviderOnSuccessData } from "../providers/custom/qr/index.ts";
import { createClient } from ".";
import OpenAuthsterErrors, { type ErrorList } from "./errors";
import { MFAmanager } from "./mfa";
import { Passkey } from "./passkey";

export const userEndpointURI = "/session" as const;

export type FlowTypes = "invite" | "qr" | "passkey";

const providerTypes = [
	"code",
	"oidc",
	"oauth",
	"appleoauth",
	"appleoidc",
	"apple",
	"x",
	"slack",
	"yahoo",
	"google",
	"github",
	"twitch",
	"spotify",
	"cognito",
	"discord",
	"facebook",
	"keycloak",
	"password",
	"microsoft",
	"jumpcloud",
	"qr",
	"passkey",
] as const satisfies readonly ProviderType[];

const providerUserInfoSchema = v.optional(v.looseObject({}));
const providerUserInfoSchemas = Object.fromEntries(
	providerTypes.map((provider) => [provider, providerUserInfoSchema]),
) as Record<ProviderType, typeof providerUserInfoSchema>;

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
				...providerUserInfoSchemas,
				email: v.optional(v.string()),
				provider: v.string(),
				role: v.nullable(v.string()),
				mfa: v.object({
					totp_enabled: v.boolean(),
				}),
			}),
		}),
	),
	error: v.optional(v.string()),
});

export type CodeUserInfo = {
	email?: string;
	phone?: string;
};

export type OIDCUserInfo = JWTPayload;

export type OAuthUserInfo = Record<string, unknown>;

export type AppleUserInfo = JWTPayload;

export type PasswordUserInfo = {
	email: string;
};

export type XUserInfo = {
	data: {
		id: string;
		name: string;
		username: string;
		profile_image_url?: string;
	};
};

export type SlackUserInfo = {
	sub: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
	locale?: string;
	[key: string]: unknown;
};

export type CognitoUserInfo = {
	sub: string;
	email?: string;
	email_verified?: string;
	username?: string;
	name?: string;
	[key: string]: unknown;
};

export type DiscordUserInfo = {
	id: string;
	username: string;
	discriminator: string;
	global_name?: string;
	avatar?: string;
	email?: string;
	verified?: boolean;
	locale?: string;
};

export type FacebookUserInfo = {
	id: string;
	name?: string;
	email?: string;
	picture?: {
		data: {
			url: string;
			width: number;
			height: number;
		};
	};
};

export type GitHubUserInfo = {
	id: number;
	login: string;
	name?: string;
	email?: string;
	avatar_url?: string;
	bio?: string;
	company?: string;
	location?: string;
};

export type GoogleUserInfo = {
	email?: string;
	email_verified?: boolean;
	sub: string;
	name?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
};

export type JumpCloudUserInfo = {
	sub: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	given_name?: string;
	family_name?: string;
};

export type KeycloakUserInfo = {
	sub: string;
	email?: string;
	email_verified?: boolean;
	preferred_username?: string;
	name?: string;
	given_name?: string;
	family_name?: string;
	[key: string]: unknown;
};

export type MicrosoftUserInfo = {
	id?: string;
	sub?: string;
	name?: string;
	displayName?: string;
	email?: string;
	givenName?: string;
	given_name?: string;
	surname?: string;
	family_name?: string;
	mail?: string;
	preferred_username?: string;
	userPrincipalName?: string;
	jobTitle?: string;
};

export type SpotifyUserInfo = {
	id: string;
	display_name?: string;
	email?: string;
	images?: Array<{ url: string; width: number; height: number }>;
	country?: string;
	product?: string;
};

export type TwitchUserInfo = {
	data: Array<{
		id: string;
		login: string;
		display_name: string;
		email?: string;
		profile_image_url?: string;
		broadcaster_type?: string;
	}>;
};

export type YahooUserInfo = {
	sub: string;
	name?: string;
	email?: string;
	email_verified?: boolean;
	picture?: string;
};

export type QRUserInfo = QRProviderOnSuccessData;

export type PasskeyUserInfo = Record<string, string>;

export type ProviderUserInfoMap = {
	code?: CodeUserInfo;
	oidc?: OIDCUserInfo;
	oauth?: OAuthUserInfo;
	appleoauth?: AppleUserInfo;
	appleoidc?: AppleUserInfo;
	apple?: AppleUserInfo;
	x?: XUserInfo["data"];
	slack?: SlackUserInfo;
	yahoo?: YahooUserInfo;
	google?: GoogleUserInfo;
	github?: GitHubUserInfo;
	twitch?: TwitchUserInfo["data"][number];
	spotify?: SpotifyUserInfo;
	cognito?: CognitoUserInfo;
	discord?: DiscordUserInfo;
	facebook?: FacebookUserInfo;
	keycloak?: KeycloakUserInfo;
	password?: PasswordUserInfo;
	microsoft?: MicrosoftUserInfo;
	jumpcloud?: JumpCloudUserInfo;
	qr?: QRUserInfo;
	passkey?: PasskeyUserInfo;
};

export type UserInfoType<
	Roles extends string,
	ProviderData extends
		Partial<ProviderUserInfoMap> = Partial<ProviderUserInfoMap>,
> = {
	provider: ProviderType;
	role: Roles;
	email?: string;
	mfa: {
		totp_enabled: boolean;
	};
} & ProviderData;

export type UserFetchResponse<
	PublicSessionData = unknown,
	PrivateSessionData = unknown,
	Roles extends string = string,
> = {
	success: boolean;
	data?: {
		private: PrivateSessionData;
		public: PublicSessionData;
		user_id: string;
		user_identifier: string;
		userInfo: {
			provider: ProviderType;
			role: Roles | null;
		};
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
	copyID?: string | null;
};

export type DeleteUserResult = {
	success: boolean;
	error: null | string;
};

type AuthFlowCallbacks<
	Public extends RequiredResponseData["public"],
	Private extends RequiredResponseData["private"],
	UserInfo extends UserInfoType<Roles, ProviderData>,
	ProviderData extends Partial<ProviderUserInfoMap>,
	Roles extends string,
> = {
	/**
	 * Event triggered when the QR authentication flow is initiated. This can be used to perform a security mesure to verify that the user ia aware of the login attempt, for example by displaying a notification or requiring a confirmation before proceeding with the authentication process.
	 * @returns true for prceeding with the authentication flow, false to abort. Can also return a Promise resolving to true or false for asynchronous operations.
	 * @returns `{ totp_elevated_token: <elevated_token> }` to proceed with the authentication flow using the provided elevated token, allowing you to login via QR Flow if require MFA is enabled
	 */
	onQRAuthFlowStart: (
		client: OpenAuthsterClient<Public, Private, Roles, UserInfo, ProviderData>,
	) =>
		| boolean
		| Promise<boolean>
		| { totp_elevated_token: string }
		| Promise<{ totp_elevated_token: string }>;
	/**
	 * Triggered when QR AuthFlow did succeed
	 */
	onQRAuthFlowSuccess: (
		client: OpenAuthsterClient<Public, Private, Roles, UserInfo, ProviderData>,
	) => void;
	/**
	 * Triggered when QR AuthFlow failed
	 */
	onQRAuthFlowError: (
		client: OpenAuthsterClient<Public, Private, Roles, UserInfo, ProviderData>,
	) => void;
	/**
	 * Event triggered when the token is expired and a refresh attempt as failed.
	 *
	 * The callback must return true for redirecting the user to the login page, false to manage it yourself.
	 */
	onLoginRequired: (
		client: OpenAuthsterClient<Public, Private, Roles, UserInfo, ProviderData>,
	) => void;
};

export type CacheStoreData<
	Roles extends string,
	UserInfo extends UserInfoType<Roles, ProviderData>,
	ProviderData extends Partial<ProviderUserInfoMap>,
> = {
	meta: UserMetaData<Roles> & { data: UserInfo };
};

export type ClientProps<
	PublicSessionData extends RequiredResponseData["public"],
	PrivateSessionData extends RequiredResponseData["private"],
	Roles extends string,
	UserInfo extends UserInfoType<Roles, ProviderData> & Record<string, unknown>,
	ProviderData extends Partial<ProviderUserInfoMap>,
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
		AuthFlowCallbacks<
			PublicSessionData,
			PrivateSessionData,
			UserInfo,
			ProviderData,
			Roles
		>
	>;
	onError?: (err: ErrorList) => void;
	/**
	 * Optional cache provider for storing User metaData and token
	 * Originaly designed for reducing the number of calls to the user endpoint in server side environments by caching the user meta data associated with a token, but can be used for any custom caching strategy you want to implement.
	 */
	cache_provider?: {
		get: (
			key: string,
		) => Promise<CacheStoreData<Roles, UserInfo, ProviderData> | null>;
		set: (
			key: string,
			value: CacheStoreData<Roles, UserInfo, ProviderData>,
			expires_at: Date,
		) => Promise<void>;
		delete: (key: string) => Promise<void>;
	};
} & OpenAuthsterOptions;

export type UserMetaData<Roles extends string> = {
	id: string | null;
	identifier: string | null;
	role: Roles | null;
};

type RequiredResponseData = Exclude<ResponseData["data"], undefined>;

type ErrorType = {
	error: string;
	error_description: string | null;
};

type CallbackType<
	PublicSessionData extends RequiredResponseData["public"],
	PrivateSessionData extends RequiredResponseData["private"],
	Roles extends string,
	UserInfo extends UserInfoType<Roles, ProviderData>,
	ProviderData extends Partial<ProviderUserInfoMap>,
> = (
	client: OpenAuthsterClient<
		PublicSessionData,
		PrivateSessionData,
		Roles,
		UserInfo,
		ProviderData
	>,
	error?: ErrorType,
) => void | Promise<void>;

/**
 * OpenAuthsterClient is a client library for interacting with an OpenAuthSter Issuer, providing methods for authentication, session management, and user data fetching/updating. It supports both browser and server environments, with specific methods for handling tokens from incoming requests on the server side. The client manages authentication state, session data, and provides a simple interface for making authenticated requests to protected endpoints. It also includes functionality for automatically refreshing tokens before they expire to maintain an active session.
 *
 * @typeParam PublicSessionData - The type of the public session data. Defaults to `any`.
 * @typeParam PrivateSessionData - The type of the private session data. Defaults to `any`.
 * @typeParam UserInfo - The type of the user info data returned by the provider depending on the scopes you setted. Defaults to `any`.
 * @typeParam Roles - The type of the roles. Defaults to `string`.
 */
export class OpenAuthsterClient<
	PublicSessionData extends RequiredResponseData["public"],
	PrivateSessionData extends RequiredResponseData["private"],
	Roles extends string,
	UserInfo extends UserInfoType<Roles, ProviderData>,
	ProviderData extends Partial<ProviderUserInfoMap>,
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
	public userMeta: UserMetaData<Roles> = {
		id: null,
		identifier: null,
		role: null,
	};
	public userInfo: UserInfo | null = null;
	public error: { error: string; error_description: string | null } | null =
		null;

	private issuerURI: string;
	private clientID: string;
	private copyID: string | null = null;
	private secret?: string;
	private token: string | null = null;
	private refreshToken: string | null = null;
	private redirectURI: string;
	private refreshTimer: Timer | undefined;
	private refreshPromise: Promise<boolean> | null = null;
	private initListeners: Map<
		string,
		CallbackType<
			PublicSessionData,
			PrivateSessionData,
			Roles,
			UserInfo,
			ProviderData
		>
	> = new Map();
	private subject: typeof defaultSubjectSchema = defaultSubjectSchema;
	private authFlowCallbacks: Partial<
		AuthFlowCallbacks<
			PublicSessionData,
			PrivateSessionData,
			UserInfo,
			ProviderData,
			Roles
		>
	>;
	private onError?: (err: ErrorList) => void;
	private cacheProvider?: ClientProps<
		PublicSessionData,
		PrivateSessionData,
		Roles,
		UserInfo,
		ProviderData
	>["cache_provider"];
	public mfa: MFAmanager;
	public passkey: Passkey<
		OpenAuthsterClient<
			PublicSessionData,
			PrivateSessionData,
			Roles,
			UserInfo,
			ProviderData
		>
	>;

	constructor(
		props: ClientProps<
			PublicSessionData,
			PrivateSessionData,
			Roles,
			UserInfo,
			ProviderData
		>,
	) {
		this.verifyProps(props);
		this.issuerURI = props.issuerURI;
		this.clientID = props.clientID;
		this.copyID = props.copyID ?? null;
		this.openAuthClient = this.createOpenAuthClient();
		this.secret = props.secret;
		this.token = props.token ?? this.getStoredToken();
		this.refreshToken = props.refreshToken ?? this.getStoredRefreshToken();
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
		this.passkey = new Passkey(this.issuerURI, this);
		this.cacheProvider = props.cache_provider;
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
			.then((_json) => {
				if (!_json.success)
					throw new Error(_json.error || "Failed to fetch user session");
				return _json;
			})
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
			.then((_json) => {
				if (!_json.success)
					throw new Error(_json.error || "Failed to update user session");
				return _json;
			})
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
		options?: AuthorizeOptions & {
			autoNavigate?: boolean;
			copyID?: string | null;
		},
	): Promise<string> {
		const { autoNavigate = true, copyID, ...authorizedOptions } = options || {};
		if (typeof copyID !== "undefined") {
			this.setCopyID(copyID ?? null);
		}
		const effectiveCopyID = copyID ?? this.copyID ?? undefined;

		return this.openAuthClient
			.authorize(this.redirectURI, "code", authorizedOptions)
			.then((e) => {
				this.setChallenge(e.challenge);
				const authURL = new URL(e.url);
				const currentURI = new URL(window.location.href);
				const inviteId = currentURI.searchParams.get("invite_id");
				inviteId && authURL.searchParams.set("invite_id", inviteId);
				effectiveCopyID && authURL.searchParams.set("copy_id", effectiveCopyID);
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
		this.refreshPromise = null;
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
		this.userMeta = {
			id: null,
			identifier: null,
			role: null,
		};
		return this.triggerUpdate();
	}
	/**
	 * Releases timers and listeners held by the client.
	 *
	 * Useful in tests and long-lived applications that recreate client instances.
	 */
	dispose() {
		this.refreshPromise = null;
		this.clearRefreshTimer();
		this.initListeners.clear();
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
	 * Updates runtime client options. Supports updating `secret` and `copyID`.
	 *
	 * @param options - Options to update.
	 */
	updateOptions(options: OpenAuthsterOptions) {
		if ("secret" in options) {
			this.secret = options.secret;
		}
		if ("copyID" in options) {
			this.setCopyID(options.copyID ?? null);
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
		callback: CallbackType<
			PublicSessionData,
			PrivateSessionData,
			Roles,
			UserInfo,
			ProviderData
		>,
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
		Reflect.set(
			document,
			"cookie",
			`access_token=${this.token}; path=/; secure; samesite=lax;`,
		);
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
	async setTokenFromRequest(request: Request): Promise<this> {
		const token = this.getTokenFromRequest(request);
		if (!token) {
			this.token = null;
			this.isAuthenticated = false;
			return Promise.resolve(this);
		}

		if (this.cacheProvider?.get) {
			const cached = await this.cacheProvider.get(token);
			if (cached) {
				this.token = token;
				this.isAuthenticated = true;
				this.userMeta = cached.meta;
				return this;
			}
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
			if (this.expiresAt && new Date() > this.expiresAt) {
				if (!(await this.triggerRefresh()))
					throw new Error("Token expired and refresh failed");
			}
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
			.then((_json) => {
				if (!_json.success)
					throw new Error(_json.error || "Failed to clear public session");
				return _json;
			})
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
			.then((_json) => {
				if (!_json.success)
					throw new Error(_json.error || "Failed to clear private session");
				return _json;
			})
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
				UserInfo,
				Roles
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
							UserInfo,
							Roles
						>
					>,
			)
			.then((json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to fetch user by ID.");
				}
				return json;
			})
			.then(
				(_json) =>
					v.parse(
						UserListSchemaValidation,
						_json,
					) as UserResponseSchemaInferdType<
						PublicSessionData,
						PrivateSessionData,
						UserInfo,
						Roles
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
	getManyUserById(
		ids: string[],
	): Promise<
		| UserResponseSchemaInferdType<
				PublicSessionData,
				PrivateSessionData,
				UserInfo,
				Roles
		  >
		| Error
	> {
		const url = new URL(`${this.issuerURI}/users/specific`);
		ids.forEach((id) => {
			url.searchParams.append("user_id", id);
		});
		return this.fetchWithOptions(url.toString(), {
			method: "GET",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserResponseSchemaType<
							PublicSessionData,
							PrivateSessionData,
							UserInfo,
							Roles
						>
					>,
			)
			.then((json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to fetch users by IDs.");
				}
				return json;
			})
			.then(
				(_json) =>
					v.parse(
						UserListSchemaValidation,
						_json,
					) as UserResponseSchemaInferdType<
						PublicSessionData,
						PrivateSessionData,
						UserInfo,
						Roles
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
				UserInfo,
				Roles
		  >
		| Error
	> {
		const url = new URL(`${this.issuerURI}/users`);
		if (filters?.page) url.searchParams.set("page", filters.page.toString());
		if (filters?.limit) url.searchParams.set("limit", filters.limit.toString());
		return this.fetchWithOptions(url.toString(), {
			method: "GET",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserResponseSchemaType<
							PublicSessionData,
							PrivateSessionData,
							UserInfo,
							Roles
						>
					>,
			)
			.then((json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to fetch users.");
				}
				return json;
			})
			.then(
				(_json) =>
					v.parse(
						UserListSchemaValidation,
						_json,
					) as UserResponseSchemaInferdType<
						PublicSessionData,
						PrivateSessionData,
						UserInfo,
						Roles
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
	deleteUserById(user_id: string): Promise<DeleteUserResult> {
		return this.fetchWithOptions(`${this.issuerURI}/user/${user_id}`, {
			method: "DELETE",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserResponseSchemaType<
							PublicSessionData,
							PrivateSessionData,
							UserInfo,
							Roles
						>
					>,
			)
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
	 * Deletes the currently authenticated user using the active JWT.
	 *
	 * On success, local authentication state is cleared because the access and refresh tokens are no longer valid.
	 *
	 * **`Client or Server Side`** — on the server, call `setTokenFromRequest` first.
	 */
	async deleteCurrentUser(): Promise<DeleteUserResult> {
		this.ensureReady();

		return this.fetchWithOptions(`${this.issuerURI}/manage/user`, {
			method: "DELETE",
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserResponseSchemaType<
							PublicSessionData,
							PrivateSessionData,
							UserInfo,
							Roles
						>
					>,
			)
			.then(async (json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to delete current user.");
				}
				await this.logout();
				return { success: true, error: null };
			})
			.catch((err) => ({
				success: false,
				error: `Failed to delete current user: ${err.message}`,
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
	): Promise<
		| UserResponseSchemaType<
				PublicSessionData,
				PrivateSessionData,
				UserInfo,
				Roles
		  >["data"]
		| Error
	> {
		return this.fetchWithOptions(`${this.issuerURI}/user/${user_id}`, {
			method: "PUT",
			body: JSON.stringify(data),
			headers: {
				"Content-Type": "application/json",
			},
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserResponseSchemaType<
							PublicSessionData,
							PrivateSessionData,
							UserInfo,
							Roles
						>
					>,
			)
			.then((json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to update user.");
				}
				return json.data;
			})
			.catch((err) => new Error(`Failed to update user by ID: ${err.message}`));
	}

	/**
	 * Updates a user's role by their ID. Only the `role` field will be updated; all other fields are left unchanged.
	 *
	 * **`Requires secret to be set.`**
	 *
	 * @param user_id - The ID of the user to update.
	 * @param role - The new role to assign to the user.
	 * @returns The updated user data on success, or an Error on failure.
	 */
	setUserRoleById(
		user_id: string,
		role: Roles,
	): Promise<
		| UserResponseSchemaType<
				PublicSessionData,
				PrivateSessionData,
				UserInfo,
				Roles
		  >["data"]
		| Error
	> {
		return this.fetchWithOptions(`${this.issuerURI}/user/role`, {
			method: "PUT",
			body: JSON.stringify({ user_id, role }),
			headers: {
				"Content-Type": "application/json",
			},
		})
			.then(
				(res) =>
					res.json() as Promise<
						UserResponseSchemaType<
							PublicSessionData,
							PrivateSessionData,
							UserInfo,
							Roles
						>
					>,
			)
			.then((json) => {
				if (!json.success) {
					throw new Error(json.error || "Failed to update user role.");
				}
				return json.data;
			})
			.catch((err) => new Error(`Failed to update user role: ${err.message}`));
	}

	/**
	 * Returns the current access token, falling back to the value stored in localStorage. Returns `null` if no token is available.
	 */
	getToken() {
		return this.token || this.getStoredToken();
	}
	/**
	 * Returns lightweight metadata for the current user (`id`, `identifier`, `provider`, `role`)
	 * by verifying the token and extracting its subject claims, without loading session blobs.
	 * Useful for lightweight presence checks.
	 *
	 * **`Client or Server Side`**
	 */
	async getMetaData(): Promise<
		(UserMetaData<Roles> & { data: UserInfo }) | null
	> {
		const token = this.getToken();
		if (!token) return null;
		const meta = await this.retriveUserMeta(token);

		if (meta && this.cacheProvider?.set && token) {
			await this.cacheProvider.set(
				token,
				{ meta },
				this.expiresAt ? this.expiresAt : new Date(Date.now() + 1 * 60 * 1000),
			);
		}

		const { data, ...metaWithoutData } = meta ?? {};

		this.userInfo = data ?? null;
		this.userMeta = (metaWithoutData as UserMetaData<Roles>) ?? null;

		return meta;
	}
	private async retriveUserMeta(
		token: string,
	): Promise<(UserMetaData<Roles> & { data: UserInfo }) | null> {
		if (this.cacheProvider?.get && token) {
			const cachedMeta = await this.cacheProvider.get(token);
			if (cachedMeta) {
				return cachedMeta.meta;
			}
		}
		const result = await this.verifyToken(token);
		if (result.err || !result.subject) return null;
		const props = result.subject.properties;

		return {
			id: props.id,
			identifier: props.identifier,
			role: props.role as Roles | null,
			data: props.data as UserInfo,
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
				return false;
			});
	}

	/**
	 * Attempts to refresh the access token using the stored refresh token. Retries up to 3 times with exponential backoff (2 s, 4 s, 6 s). Returns `true` on success, `false` if all attempts fail (which triggers logout or `onLoginRequired`).
	 *
	 * **`Client Side`**
	 */
	async triggerRefresh(): Promise<boolean> {
		if (this.refreshPromise) {
			return this.refreshPromise;
		}

		this.refreshPromise = this.runRefreshFlow().finally(() => {
			this.refreshPromise = null;
		});

		return this.refreshPromise;
	}

	private async runRefreshFlow(): Promise<boolean> {
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
				return;
			}
			if (this.expiresAt) {
				this.createResetTimer(this.expiresAt.getTime() - Date.now());
			}
		} else if (this.expiresAt) {
			this.createResetTimer(this.expiresAt.getTime() - Date.now());
		}

		if (this.token) {
			this.isAuthenticated = true;
		}
	}

	private async QRauthFlowCallback(id: string | null): Promise<unknown> {
		const onStart = this.authFlowCallbacks.onQRAuthFlowStart ?? (() => true);

		const result = await onStart(this);
		let fetcher:
			| typeof this.fetchWithOptions
			| typeof this.mfa.totpClient.elevatedFetch =
			this.fetchWithOptions.bind(this);

		if (result === false) return;

		if (
			typeof result === "object" &&
			typeof result.totp_elevated_token === "string"
		) {
			fetcher = (input, init) =>
				this.mfa.totpClient.elevatedFetch.bind(this)({
					input,
					init,
					elevatedToken: result.totp_elevated_token,
				});
		}

		if (!this.getStoredToken()) return this.login();
		if (!id) {
			this.error = {
				error: "missing_qr_validation_id",
				error_description: "No QR validation ID provided in URL.",
			};
			return;
		}
		const _url = new URL(`${this.issuerURI}/qr/validate`);
		_url.searchParams.set("id", id);

		const res: { success: boolean; error?: string } = await fetcher(
			_url.toString(),
			{
				method: "POST",
			},
		)
			.then((res) => res.text())
			.then((text) => {
				try {
					return JSON.parse(text) as { success: boolean; error?: string };
				} catch {
					throw new Error(text);
				}
			})
			.catch((err) => {
				console.error("Error validating QR code: ", err);
				this.error = {
					error: "qr_validation_failed",
					error_description: err.message,
				};
				return { success: false, error: err.message as string };
			});

		if (!res.success) {
			this.triggerError(
				new OpenAuthsterErrors.TotpError(
					res.error ?? "QR auth flow verification failed",
					"request_failed",
				),
			);
			this.authFlowCallbacks.onQRAuthFlowError?.(this);
		} else {
			this.authFlowCallbacks.onQRAuthFlowSuccess?.(this);
		}
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
		if (data.data.user_id) this.userMeta.id = data.data.user_id;
		if (data.data.user_identifier)
			this.userMeta.identifier = data.data.user_identifier;
		if (data.data.userInfo) {
			this.userInfo = data.data.userInfo as UserInfo;
		}
		if (data.data.userInfo?.role)
			this.userMeta.role = data.data.userInfo.role as Roles;
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
		if (!expiresInMs || expiresInMs <= 0) return;
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
				this.createResetTimer(expTimeStamp - Date.now());
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

	private createOpenAuthClient() {
		return createClient({
			clientID: this.clientID,
			issuer: this.issuerURI,
			copyID: this.copyID,
		});
	}

	private setCopyID(copyID: string | null) {
		if (this.copyID === copyID) return;
		this.copyID = copyID;
		this.openAuthClient = this.createOpenAuthClient();
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
		props: ClientProps<
			PublicSessionData,
			PrivateSessionData,
			Roles,
			UserInfo,
			ProviderData
		>,
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
 * @typeParam Roles - The type of the roles..
 * @typeParam UserInfo - The type of the user info data returned by the provider depending on the scopes you setted. Defaults to `any`.
 */
export function createOpenAuthsterClient<
	PublicSessionData extends RequiredResponseData["public"],
	PrivateSessionData extends RequiredResponseData["private"],
	Roles extends string,
	ProviderData extends
		Partial<ProviderUserInfoMap> = Partial<ProviderUserInfoMap>,
>(
	props: ClientProps<
		PublicSessionData,
		PrivateSessionData,
		Roles,
		UserInfoType<Roles, ProviderData>,
		ProviderData
	>,
): OpenAuthsterClient<
	PublicSessionData,
	PrivateSessionData,
	Roles,
	UserInfoType<Roles, ProviderData>,
	ProviderData
> {
	return new OpenAuthsterClient<
		PublicSessionData,
		PrivateSessionData,
		Roles,
		UserInfoType<Roles, ProviderData>,
		ProviderData
	>(props);
}
