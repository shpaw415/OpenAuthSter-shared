import type {
  Challenge,
  Client,
  ExchangeSuccess,
  RefreshSuccess,
} from "@openauthjs/openauth/client";
import * as v from "valibot";
import type { InferOutput } from "valibot";
import { createClient } from ".";
export const userEndpointURI = "/user-endpoint" as const;

export const UserEndpointValidation = v.object({
  id: v.string(),
  type: v.union([v.literal("public"), v.literal("private")]),
  action: v.union([v.literal("get"), v.literal("update")]),
  data: v.optional(v.any()),
  clientID: v.string(),
});

export type RequestData = InferOutput<typeof UserEndpointValidation>;

export type OpenAuthsterOptions = {
  copyID?: string | null;
};

export type ClientProps<PublicSessionData = any, PrivateSessionData = any> = {
  issuerURI: string;
  clientID: string;
  userId?: string;
  token: string | null;
  refreshToken: string | null;
  redirectURI: string;
  onCheck?: (
    openauthserClient: OpenAuthsterClient<
      PublicSessionData,
      PrivateSessionData
    >,
  ) => void;
  /**
   * Server side ONLY !! but necessary for private user session `get/update`
   */
  secret?: string;
} & OpenAuthsterOptions;

export type UserFetchResponse<
  PublicSessionData = any,
  PrivateSessionData = any,
> = {
  success: boolean;
  data?: {
    private: PrivateSessionData;
    public: PublicSessionData;
  };
  error?: string;
};

export function createOpenAuthsterClient<
  PublicSessionData = any,
  PrivateSessionData = any,
>(props: ClientProps<PublicSessionData, PrivateSessionData>) {
  return new OpenAuthsterClient<PublicSessionData, PrivateSessionData>(props);
}

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

  private issuerURI: string;
  private clientID: string;
  private secret?: string;
  private userId?: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private redirectURI: string;
  private refreshTimer: number | undefined;

  constructor(props: ClientProps) {
    this.issuerURI = props.issuerURI;
    this.openAuthClient = createClient({
      clientID: props.clientID,
      issuer: props.issuerURI,
      copyID: props.copyID ?? null,
    });
    this.secret = props.secret;
    this.userId = props.userId;
    this.token = props.token ?? this.getStoredToken();
    this.refreshToken = props.refreshToken ?? this.getStoredRefreshToken();
    this.clientID = props.clientID;
    this.redirectURI = props.redirectURI;
    this.init().finally(() => props.onCheck?.(this));
  }

  async init() {
    const accessToken = this.token || this.getStoredToken();
    const refreshToken = this.refreshToken || this.getStoredRefreshToken();

    if (accessToken) {
      this.token = accessToken;
      this.isAuthenticated = true;
      this.isLoaded = true;
    }
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
  }

  private ensureReady() {
    if (!this.token) {
      throw new Error("Client is not authenticated. Token is missing.");
    }
    if (!this.userId) {
      throw new Error("Client is not authenticated. User ID is missing.");
    }
  }

  getUserSession(type: RequestData["type"]) {
    this.ensureReady();
    const body = this.createFormData({
      action: "get",
      type,
      id: this.userId!,
      clientID: this.clientID,
    });

    return this.createFetch(body)
      .then(
        (res) =>
          res.json() as Promise<
            UserFetchResponse<PublicSessionData, PrivateSessionData>
          >,
      )
      .then((json) => {
        if (json.success) {
          this.data = json.data!;
          return json.data;
        } else {
          return Promise.reject(
            new Error("Failed to fetch user session data."),
          );
        }
      });
  }

  updateUserSession<SessionData extends PublicSessionData | PrivateSessionData>(
    type: RequestData["type"],
    data: SessionData,
  ) {
    this.ensureReady();
    const body = this.createFormData({
      action: "update",
      type,
      id: this.userId!,
      clientID: this.clientID,
      data,
    });

    return this.createFetch(body)
      .then(
        (res) =>
          res.json() as Promise<
            UserFetchResponse<PublicSessionData, PrivateSessionData>
          >,
      )
      .then((json) => {
        if (json.success) {
          this.data = json.data!;
          return json.data;
        } else {
          return Promise.reject(
            new Error("Failed to update user session data."),
          );
        }
      });
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
        this.isLoaded = true;
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
    return localStorage.getItem("oa_token");
  }
  private storeToken(token: string) {
    localStorage.setItem("oa_token", token);
  }
  private removeToken() {
    localStorage.removeItem("oa_token");
  }
  private getStoredRefreshToken(): string | null {
    return localStorage.getItem("oa_refresh_token");
  }
  private storeRefreshToken(refreshToken: string) {
    localStorage.setItem("oa_refresh_token", refreshToken);
  }
  private removeRefreshToken() {
    localStorage.removeItem("oa_refresh_token");
  }

  private createFormData(data: RequestData): FormData {
    const formData = new FormData();
    formData.append("action", data.action);
    formData.append("type", data.type);
    formData.append("id", data.id);
    formData.append("clientID", data.clientID);
    if (data.data) {
      formData.append("data", JSON.stringify(data.data));
    }
    return formData;
  }

  private createFetch(body?: RequestInit<RequestInitCfProperties>["body"]) {
    return fetch(`${this.issuerURI}${userEndpointURI}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: this.token ? `Bearer ${this.token}` : "",
        "X-Client-Secret": this.secret ? this.secret : "",
      },
      credentials: "include",
      body,
    });
  }
}
