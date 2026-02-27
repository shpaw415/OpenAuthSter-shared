import type {
  Challenge,
  Client,
  ExchangeSuccess,
  RefreshSuccess,
} from "@openauthjs/openauth/client";
import * as v from "valibot";
import type { InferOutput } from "valibot";
import { createClient } from ".";
import {
  createSubjects,
  type SubjectSchema,
} from "@openauthjs/openauth/subject";
import {
  UserListSchemaValidation,
  type GetUserListFilters,
  type UserResponseSchemaType,
  type UserResponseSchemaInferdType,
} from "../database/endpoints";
import type { OTFUsersParsedType } from "../database/schema";
import OpenAuthsterErrors, { type ErrorList } from "./errors";
import { InvalidRefreshTokenError } from "@openauthjs/openauth/error";
import { MFAmanager } from "./mfa";

export const userEndpointURI = "/session" as const;

export type FlowTypes = "invite" | "qr";

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
  PublicSessionData = any,
  PrivateSessionData = any,
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

export type UpdateUserByIdData = Partial<
  Omit<OTFUsersParsedType, "created_at" | "id" | "identifier">
>;

export type OpenAuthsterOptions = {
  copyID?: string | null;
  secret?: string;
};

type AuthFlowCallbacks = {
  /**
   * Event triggered when the QR authentication flow is initiated. This can be used to perform a security mesure to verify that the user ia aware of the login attempt, for example by displaying a notification or requiring a confirmation before proceeding with the authentication process.
   * @returns true for prceeding with the authentication flow, false to abort. Can also return a Promise resolving to true or false for asynchronous operations.
   */
  onQRAuthFlowStart: () => boolean | Promise<boolean>;
  /**
   * Event triggered when the token is expired and a refresh attempt as failed.
   *
   * The callback must return true for redirecting the user to the login page, false to manage it yourself.
   */
  onLoginRequired: () => boolean | Promise<boolean>;
};

export type ClientProps<PublicSessionData = any, PrivateSessionData = any> = {
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
  subject?: SubjectSchema;
  authFlowCallbacks?: Partial<AuthFlowCallbacks>;
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
  PublicSessionData extends RequiredResponseData["public"] = {},
  PrivateSessionData extends RequiredResponseData["private"] = {},
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
  PublicSessionData extends RequiredResponseData["public"] = {},
  PrivateSessionData extends RequiredResponseData["private"] = {},
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
  private subject: SubjectSchema = defaultSubjectSchema;
  private authFlowCallbacks: Partial<AuthFlowCallbacks>;
  private onError?: (err: ErrorList) => void;
  public mfa: MFAmanager;

  constructor(props: ClientProps) {
    this.issuerURI = props.issuerURI;
    this.openAuthClient = createClient({
      clientID: props.clientID,
      issuer: props.issuerURI,
      copyID: props.copyID ?? null,
    });
    this.secret = props.secret;
    this.token = props.token ?? this.getStoredToken();
    this.refreshToken = props.refreshToken ?? this.getStoredRefreshToken();
    this.clientID = props.clientID;
    this.redirectURI = props.redirectURI;
    if (props.subject) {
      this.subject = props.subject;
    }
    this.authFlowCallbacks = props.authFlowCallbacks ?? {};
    this.onError = props.onError;
    this.mfa = new MFAmanager({
      issuerURI: this.issuerURI,
      fetch: this.fetch.bind(this) as any,
      onError: this.onError ?? (() => {}),
    });
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
   * Triggers an update by calling all registered initialization listeners. This can be used to notify any components or parts of the application that are listening for updates to re-render or fetch new data after changes to authentication state or session data. The listeners will be called in the order they were registered, and can be asynchronous if needed.
   *
   * **Browser Only**
   * @example
   * ```ts
   *
   * type ErrorType = {
   *   error: string;
   *  error_description: string | null;
   * };
   *
   * // React example of a component listening for updates
   * useEffect(() => {
   *   const updateData = (client: OpenAuthsterClient, error?: ErrorType) => {
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
  triggerUpdate() {
    return Promise.all(
      this.initListeners
        .values()
        .map((callback) => callback(this, this.error || undefined)),
    ) as unknown as Promise<void>;
  }
  /**
   * Fetches the user's session data from the user endpoint. Requires the client to be authenticated and have a valid token.
   *
   * Private session data can only be accessed if the client was initialized with a secret, as the user endpoint requires the secret to authenticate requests for private session data. If the client was not initialized with a secret, attempts to fetch private session data will result in an error.
   *
   * **`Can be called both on client and server side, but token must be set first using setTokenFromRequest when calling from server side.`**
   */
  getUserSession(type: RequestData["type"]) {
    this.ensureReady();
    return this.fetch(`${this.issuerURI}/session/${type}/${this.clientID}`, {
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
   * Updates the user's session data on the user endpoint. Requires the client to be authenticated and have a valid token.
   *
   * Private session data can only be updated if the client was initialized with a secret, as the user endpoint requires the secret to authenticate requests for private session data. If the client was not initialized with a secret, attempts to update private session data will result in an error.
   *
   * **`Can be called both on client and server side, but token must be set first using setTokenFromRequest when calling from server side.`**
   */
  updateUserSession<SessionData extends PublicSessionData | PrivateSessionData>(
    type: RequestData["type"],
    data: Partial<SessionData>,
  ) {
    this.ensureReady();

    return this.fetch(`${this.issuerURI}/session/${type}/${this.clientID}`, {
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
   * Initiates the login process by redirecting the user to the authorization URL provided by the OpenAuth client. The client will generate a PKCE challenge and store it in local storage before redirecting. After the user completes the login flow and is redirected back to the application, the `callback` method should be called to complete the authentication process and exchange the authorization code for tokens.
   *
   * **Browser Only**
   */
  async login(): Promise<void> {
    return this.openAuthClient.authorize(this.redirectURI, "code").then((e) => {
      this.setChallenge(e.challenge);
      const authURL = new URL(e.url);
      const currentURI = new URL(window.location.href);
      const inviteId = currentURI.searchParams.get("invite_id");
      inviteId && authURL.searchParams.set("invite_id", inviteId);
      const copyID = currentURI.searchParams.get("copyID");
      copyID && authURL.searchParams.set("copyID", copyID);
      window.location.href = authURL.toString();
    });
  }

  /**
   * Logs the user out by clearing tokens, session data, and authentication state. Also clears any stored tokens and challenges from local storage to ensure a complete logout. After calling this method, the client will no longer be authenticated and will need to go through the login process again to obtain new tokens.
   *
   * **`Browser only`**
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
        this.createResetTimer(tokens.tokens?.expiresIn || null);
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

  updateOptions(options: OpenAuthsterOptions) {
    if (options.copyID) {
      this.openAuthClient = createClient({
        clientID: this.clientID,
        issuer: this.issuerURI,
        copyID: options.copyID,
      });
    }
    if (options.secret) {
      this.secret = options.secret;
    }
  }

  /**
   * Registers a listener callback that will be invoked whenever the client is initialized or updated. This allows components or parts of the application to react to changes in authentication state or session data by re-rendering or fetching new data as needed. The listener is identified by a unique key, which can be used to remove the listener later if needed.
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
   * Extracts the Bearer token from the Authorization header of a Request object.
   *
   * **`Server side only`**
   */
  getTokenFromRequest(request: Request): string | null {
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7); // Remove "Bearer " prefix
    }
    const tokenFromCookie = request.headers
      .get("Cookie")
      ?.split(";")
      .find((cookie) => cookie.trim().startsWith("access_token="))
      ?.split("=")
      .at(1)
      ?.trim();

    return tokenFromCookie || null;
  }
  /**
   * Stores the token in a cookie for persistence across page reloads. This method can be used to manually set the token after obtaining it from an external source, such as after a successful login or token refresh.
   *
   * API call will be authenticated after calling
   *
   * **`Browser side only`**
   *
   */
  setTokenToCookie() {
    if (typeof window === "undefined" || !this.token)
      throw new Error(
        "Cannot set token to cookie: document is undefined or token is null",
      );
    document.cookie = `access_token=${this.token}; path=/; secure; samesite=strict;`;
  }

  /** Sets the client's token based on the Authorization header of a Request object. Also updates authentication state accordingly.
   *
   * Verify the token authenticity using the client's subject schema. If verification fails, the token will be rejected and an error will be logged in the console. This is a security measure to prevent unauthorized access with invalid tokens.
   *
   * **`Server side only`**
   *
   * ```ts
   * // Example usage in a server-side context
   * import { OpenAuthsterClient } from "openauthster-shared";
import { OTFusersTable } from '../database/schema';
import { USerResponseSchemaInferdType, UserResponseSchemaInferdType } from '../database/endpoints';
import { TotpClient } from './totp';
   *
   * const client = new OpenAuthsterClient({
   *   issuerURI: "https://your-issuer.com",
   *   clientID: "your-client-id",
   *   secret: "your-client-secret",
   *   redirectURI: "https://your-app.com/",
   *   subject: yourCustomSubjectSchema, // Optional custom subject schema
   * });
   *
   * async function handleRequest(request: Request) {
   *   try {
   *     await client.setTokenFromRequest(request);
   *     if (client.isAuthenticated) {
   *       // Proceed with authenticated actions
   *     } else {
   *       // Handle unauthenticated state
   *     }
   *   } catch (error) {
   *     console.error("Error setting token from request:", error);
   *     // Handle error appropriately
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
   * Make Authenticated fetch request to an endpoint needing user authentication. Automatically adds the Bearer token to the Authorization header and X-Client-Secret header if secret is provided in client initialization.
   *
   * **`Can be called both on client and server side, but token must be set first using setTokenFromRequest when calling from server side.`**
   */
  async fetch(input: RequestInfo, init?: RequestInit) {
    const isRequest = typeof input !== "string";
    const inputUrl = isRequest ? input.url : input;

    // Only use a base for relative URLs; absolute URLs are left as-is
    const isAbsolute =
      inputUrl.startsWith("http://") || inputUrl.startsWith("https://");
    const base = isAbsolute
      ? undefined
      : typeof globalThis.window !== "undefined"
        ? globalThis.window.location.origin
        : this.issuerURI;

    const url = new URL(inputUrl, base);
    url.searchParams.set("client_id", this.clientID);

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
   * Clears the user's public session data by sending a request to the user endpoint with an empty data object. This will not merge with existing data, but will replace it entirely with an empty object.
   *
   * **`Can be called both on client and server side.`**
   */
  clearPublicSession() {
    return this.fetch(`${this.issuerURI}/session/public/${this.clientID}`, {
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
   * Clears the user's private session data by sending a request to the user endpoint with an empty data object. This will not merge with existing data, but will replace it entirely with an empty object.
   *
   * **`Server side only.`**
   *
   * **Note: Secret is required to update private session, so this method will throw an error if the client was not initialized with a secret.**
   *
   */
  clearPrivateSession() {
    return this.fetch(`${this.issuerURI}/session/private/${this.clientID}`, {
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
   * Fetches a list of users from the issuer's user endpoint, with optional pagination filters. This method requires the client to be authenticated and have a valid token, as well as access to the user endpoint which may require a secret for private session data. The response is validated against the UserListSchemaValidation schema to ensure it conforms to the expected format.
   *
   * **`need secret to be set`**
   */
  getUserById(user_id: string) {
    return this.fetch(`${this.issuerURI}/user/${this.clientID}/${user_id}`, {
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
      .then((_json) => v.parse(UserListSchemaValidation, _json))
      .catch((err) => new Error(`Failed to fetch user by ID: ${err.message}`));
  }
  /**
   * Fetches a list of users from the issuer's user endpoint, with optional pagination filters. The response is validated against the UserListSchemaValidation schema to ensure it conforms to the expected format.
   *
   *  **`need secret to be set`**
   */
  getUsers(filters?: GetUserListFilters) {
    const url = new URL(`${this.issuerURI}/users/${this.clientID}`);
    if (filters?.page) url.searchParams.set("page", filters.page.toString());
    if (filters?.limit) url.searchParams.set("limit", filters.limit.toString());
    return this.fetch(url.toString(), {
      method: "GET",
    })
      .then((res) => res.json() as Promise<UserResponseSchemaType>)
      .then((_json) => v.parse(UserListSchemaValidation, _json))
      .catch((err) => new Error(`Failed to fetch users: ${err.message}`));
  }
  /**
   * Deletes a user by their ID by sending a DELETE request to the issuer's user endpoint.
   *
   * **`need secret to be set`**
   */
  deleteUserById(
    user_id: string,
  ): Promise<{ success: boolean; error: null | string }> {
    return this.fetch(`${this.issuerURI}/user/${this.clientID}/${user_id}`, {
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
   * Update user by ID
   */
  updateUserById(
    user_id: string,
    data: UpdateUserByIdData,
  ): Promise<UserResponseSchemaType["data"] | Error> {
    return this.fetch(`${this.issuerURI}/user/${this.clientID}/${user_id}`, {
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

  getToken() {
    return this.token || this.getStoredToken();
  }
  /**
   * - **Provide a token directly**: ensure it is valid
   *
   * - **No token provided**: verify the current client token and update authentication state accordingly. If verification fails, the token will be rejected and an error will be logged in the console. This is a security measure to prevent unauthorized access with invalid tokens.
   *
   * @returns A promise that resolves to `true` if the token is valid and the client is authenticated, or `false` if the token is invalid or verification fails.
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
   * Attempts to refresh the access token using the refresh token. If the refresh attempt fails, it will retry up to 3 times with exponential backoff (2s, 4s, 6s) between attempts. If all attempts fail, it will return false, indicating that the user needs to log in again. If a refresh is successful, it will update the client's token and expiration time accordingly.
   *
   * **`Client Side`**
   */
  public async triggerRefresh(): Promise<boolean> {
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
          this.authFlowCallbacks.onLoginRequired();
        } else {
          this.logout();
        }
      }
      return success;
    });
  }

  private verifyToken(token: string) {
    return this.openAuthClient.verify(this.subject, token);
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
      return this.login();
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
    this.token ??= this.getStoredToken();
    this.refreshToken ??= this.getStoredRefreshToken();
    this.expiresAt ??= this.getStoredExpiresAt();

    if (this.expiresAt && this.expiresAt < new Date()) {
      const refreshed = await this.triggerRefresh();
      if (!refreshed) return;
    } else if (this.expiresAt) {
      this.createResetTimer(this.expiresAt.getTime() - Date.now());
    }

    if (this.token) {
      this.isAuthenticated = true;
    }
  }

  private async QRauthFlowCallback(id: string | null) {
    if (!(await this.authFlowCallbacks.onQRAuthFlowStart?.())) return;

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

    return this.fetch(_url.toString(), {
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
    const self = this;
    this.refreshTimer = setTimeout(
      () => this.triggerRefresh.bind(self),
      expiresInMs,
    );
  }

  private updateTokens(tokens: ExchangeSuccess | RefreshSuccess) {
    if (tokens.tokens?.access) {
      this.token = tokens.tokens?.access;
      this.storeToken(tokens.tokens.access);
      if (tokens.tokens?.expiresIn) {
        this.expiresAt = new Date(tokens.tokens?.expiresIn * 1000 + Date.now());
        this.storeExpiresAt(this.expiresAt);
        this.createResetTimer(tokens.tokens.expiresIn * 1000);
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
    const expiresAt = parseInt(stored);
    return isNaN(expiresAt) ? null : new Date(expiresAt);
  }
  /**
   * Store the expiration time as a timestamp in milliseconds in local storage. The client will use this to determine when to attempt token refreshes. If the client is closed and reopened, it will check the stored expiration time to determine if the token is still valid or if it needs to be refreshed immediately.
   *
   * **Browser Only**
   */
  private storeExpiresAt(expiresAt: Date) {
    if (typeof window === "undefined") return;
    localStorage.setItem("oa_expires_at", expiresAt.getTime().toString());
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
}

/**
 * Factory function to create an instance of the OpenAuthsterClient with specified session data types.
 *
 * @typeParam PublicSessionData - The type of the public session data. Defaults to `any`.
 * @typeParam PrivateSessionData - The type of the private session data. Defaults to `any`.
 * @typeParam UserInfo - The type of the user info data returned by the provider depending on the scopes you setted. Defaults to `any`.
 */
export function createOpenAuthsterClient<
  PublicSessionData extends RequiredResponseData["public"] = {},
  PrivateSessionData extends RequiredResponseData["private"] = {},
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
