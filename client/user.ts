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

export const userEndpointURI = "/user-endpoint" as const;

export const UserEndpointValidation = v.object({
  type: v.union([v.literal("public"), v.literal("private")]),
  action: v.union([v.literal("get"), v.literal("update"), v.literal("delete")]),
  data: v.optional(v.any()),
  client_id: v.string(),
});

export const defaultSubjectSchema = createSubjects({
  user: v.object({
    id: v.string(),
    data: v.any(),
  }),
});

export type RequestData = InferOutput<typeof UserEndpointValidation>;

export const UserEndpointResponseValidation = v.object({
  success: v.boolean(),
  data: v.optional(
    v.object({
      public: v.any(),
      private: v.any(),
      user_id: v.string(),
      user_identifier: v.string(),
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

export type OpenAuthsterOptions = {
  copyID?: string | null;
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
} & OpenAuthsterOptions;

export type USerMetaData = {
  user_id: string | null;
  user_identifier: string | null;
};

export class OpenAuthsterClient<
  PublicSessionData = any,
  PrivateSessionData = any,
> {
  public openAuthClient: Client;
  public expiresIn?: number;
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

  private issuerURI: string;
  private clientID: string;
  private secret?: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private redirectURI: string;
  private refreshTimer: number | undefined;
  private initListeners: Map<string, () => void> = new Map();
  private subject: SubjectSchema = defaultSubjectSchema;

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
    return this._init().then(() => {
      this.initListeners.forEach((callback) => callback());
    });
  }

  triggerUpdate() {
    this.initListeners.forEach((callback) => callback());
  }

  getUserSession(type: RequestData["type"]) {
    this.ensureReady();
    const body = this.createFormData({
      action: "get",
      type,
      client_id: this.clientID,
    });

    return this.createFetch(body)
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
        (err) => new Error(`Failed to fetch user session: ${err.message}`),
      );
  }

  updateUserSession<SessionData extends PublicSessionData | PrivateSessionData>(
    type: RequestData["type"],
    data: SessionData,
  ) {
    this.ensureReady();
    const body = this.createFormData({
      action: "update",
      type,
      client_id: this.clientID,
      data,
    });

    return this.createFetch(body)
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

  async login(): Promise<void> {
    return this.openAuthClient.authorize(this.redirectURI, "code").then((e) => {
      this.setChallenge(e.challenge);
      window.location.href = e.url;
    });
  }

  logout() {
    this.token = null;
    this.refreshToken = null;
    this.expiresIn = undefined;
    this.clearRefreshTimer();
    this.removeToken();
    this.removeRefreshToken();
    this.removeChallenge();
    this.isAuthenticated = false;
    this.isLoaded = true;
    this.data = {
      public: {} as PublicSessionData,
      private: {} as PrivateSessionData,
    };
  }

  async callback() {
    const challenge = this.getChallenge();
    const code = this.getCode();

    if (!code) return;
    if (!challenge) {
      return Promise.reject(new Error("No challenge found in storage."));
    }
    await this.openAuthClient
      .exchange(code, this.redirectURI, challenge.verifier)
      .then((tokens) => {
        if (tokens.err)
          throw new Error("No tokens received from exchange.", {
            cause: tokens.err,
          });
        this.updateTokens(tokens);
        this.createResetTimer(tokens);
        this.isAuthenticated = true;
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
  }

  addInitializationListener(key: string, callback: () => void) {
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
    return null;
  }

  /** Sets the client's token based on the Authorization header of a Request object. Also updates authentication state accordingly.
   *
   * Verify the token authenticity using the client's subject schema. If verification fails, the token will be rejected and an error will be logged in the console. This is a security measure to prevent unauthorized access with invalid tokens.
   *
   * **`Server side only`**
   */
  setTokenFromRequest(request: Request) {
    const token = this.getTokenFromRequest(request);
    if (!token) {
      this.token = null;
      this.isAuthenticated = false;
      return;
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
    });
  }

  fetch(input: RequestInfo, init?: RequestInit) {
    this.ensureReady();
    const authInit = {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${this.token}`,
        ...(this.secret ? { "X-Client-Secret": this.secret } : {}),
      },
    };
    return fetch(input, authInit);
  }
  /**
   * Clears the user's public session data by sending a request to the user endpoint with an empty data object. This will not merge with existing data, but will replace it entirely with an empty object.
   *
   * **`Can be called both on client and server side.`**
   */
  clearPublicSession() {
    return this.createFetch(
      this.createFormData({
        action: "delete",
        type: "public",
        client_id: this.clientID,
        data: {},
      }),
    )
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
    return this.createFetch(
      this.createFormData({
        action: "delete",
        type: "private",
        client_id: this.clientID,
        data: {},
      }),
    )
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

  private verifyToken(token: string) {
    return this.openAuthClient.verify(this.subject, token);
  }

  private async _init() {
    if (this.getCode()) {
      await this.callback();
    } else {
      const accessToken = this.token || this.getStoredToken();
      const refreshToken = this.refreshToken || this.getStoredRefreshToken();
      if (accessToken) {
        this.token = accessToken;
        this.isAuthenticated = true;
      }
      if (refreshToken) {
        this.refreshToken = refreshToken;
      }
    }
    this.isLoaded = true;
  }

  private ensureReady() {
    if (!this.token) {
      throw new Error("Client is not authenticated. Token is missing.");
    }
  }

  private parseResponseData(data: ResponseData) {
    if (data.success && data.data) {
      this.data = {
        public: data.data.public,
        private: data.data.private,
      };
      this.userMeta = {
        user_id: data.data.user_id,
        user_identifier: data.data.user_identifier,
      };
    } else {
      throw new Error(data.error || "Failed to parse response data.");
    }
    return data.data;
  }

  private createResetTimer(tokens: ExchangeSuccess | RefreshSuccess) {
    if (!tokens.tokens?.expiresIn) return;
    this.refreshTimer = setTimeout(
      () => {
        const refreshToken = this.refreshToken ?? this.getStoredRefreshToken();
        const token = this.token || this.getStoredToken() || undefined;
        if (!refreshToken) return;
        this.openAuthClient
          .refresh(refreshToken, {
            access: token,
          })
          .then((newTokens) => {
            if (newTokens.err) {
              throw new Error("No tokens received from refresh.", {
                cause: newTokens.err,
              });
            }
            this.updateTokens(newTokens);
            this.createResetTimer(newTokens);
          })
          .catch(() => {
            console.warn("Failed to refresh token");
          });
      },
      (tokens.tokens?.expiresIn - 60) * 1000,
    ); // Refresh 1 minute before expiry
  }

  private updateTokens(tokens: ExchangeSuccess | RefreshSuccess) {
    if (tokens.tokens?.access) {
      this.token = tokens.tokens?.access;
      this.storeToken(tokens.tokens.access);
    }
    if (tokens.tokens?.refresh) {
      this.refreshToken = tokens.tokens.refresh;
      this.storeRefreshToken(tokens.tokens.refresh);
    }
    this.expiresIn = tokens.tokens?.expiresIn;
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

  private createFormData(data: RequestData): FormData {
    const formData = new FormData();
    formData.append("action", data.action);
    formData.append("type", data.type);
    formData.append("client_id", data.client_id);
    if (data.data) {
      formData.append("data", JSON.stringify(data.data));
    }
    return formData;
  }

  private createFetch(body?: RequestInit<RequestInitCfProperties>["body"]) {
    return fetch(`${this.issuerURI}${userEndpointURI}`, {
      method: "POST",
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : "",
        ...(this.secret ? { "X-Client-Secret": this.secret } : {}),
      },
      //credentials: "include",
      body,
    });
  }
}

export function createOpenAuthsterClient<
  PublicSessionData = any,
  PrivateSessionData = any,
>(props: ClientProps<PublicSessionData, PrivateSessionData>) {
  return new OpenAuthsterClient<PublicSessionData, PrivateSessionData>(props);
}
