import { type ErrorList, TotpError } from "../errors";

export type TOTPSetupData = {
  /**
   * The provisioning URI for the TOTP. This can be used to generate a QR code that can be scanned by an authenticator app. It is in the format of `otpauth://totp/{label}?secret={secret}&issuer={issuer}`
   */
  uri: string;
  /**
   * The secret for the TOTP. This can be used to manually enter the TOTP into an authenticator app if the user is unable to scan the QR code. It should be kept secret and not shared with anyone.
   */
  secret: string;
  /**
   * Backup codes for the TOTP. These can be used to remove the TOTP requirement from the user's account in case they lose access to their TOTP device. Each backup code can only be used once and should be kept in a safe place.
   */
  backupCodes: string[];
};

export type TOTPElevateData = {
  token: string;
  expires_at: string;
};

export type TOTPBackupRestoreData = {
  /**
   * The provisioning URI for the new TOTP secret. This can be used to generate a QR code that can be scanned by an authenticator app. It is in the format of `otpauth://totp/{label}?secret={secret}&issuer={issuer}`
   */
  uri: string;
  /**
   * The new secret for the TOTP. This can be used to manually enter the TOTP into an authenticator app if the user is unable to scan the QR code. It should be kept secret and not shared with anyone.
   */
  secret: string;
};

export type TOTPResponse<
  Data,
  Errors extends TotpError["type"] = TotpError["type"],
> =
  | {
      success: true;
      data: Data;
      error?: undefined;
      error_description?: undefined;
    }
  | {
      success: false;
      data?: undefined;
      error: Errors;
      error_description?: string;
    };

/**
 * fetch function that includes the elevated token in the headers. This can be used to make requests that require elevated access without having to manually include the token in each request.
 *
 * **Client Side**
 * @param input The input to fetch
 * @param init The init options for fetch
 */
type elevatedFetcher = (
  input: RequestInfo,
  init?: RequestInit,
) => Promise<Response>;
export class TOTPClient {
  public elevatedToken: string | null = null;
  constructor(
    private issuerURI: string,
    private fetch: typeof globalThis.fetch,
    private onError: (error: ErrorList) => void,
  ) {}
  /**
   * For Risky operations, the client can ask the user for a TOTP code and exchange it for a short-lived elevated access token with an endpoint dedicated on the server.
   *
   * **Client Side**
   *
   * @param code The 6 digits of the TOTP
   *
   * @returns An object containing the elevated token and a fetch function that includes the elevated token in the headers, or null if the request failed. The elevated token is valid for 5 minutes.
   */
  async getElevatedToken(code: string) {
    const res = await this.fetch(`${this.issuerURI}/totp/elevate`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });

    const data = (await res.json()) as TOTPResponse<TOTPElevateData>;

    if (!res.ok) {
      this.onError(
        new TotpError(data.error || "Request failed", "request_failed"),
      );
      return null;
    } else if (data.error) {
      const err = new TotpError(
        data.error_description || "TOTP elevation failed",
        data.error,
      );
      this.onError(err);
      return err;
    } else if (!data.data) {
      const err = new TotpError("No data returned", "request_failed");
      this.onError(err);
      return err;
    }

    return {
      token: data.data.token,
      fetch: (input: RequestInfo, init?: RequestInit) =>
        this.elevatedFetch.bind(this)({
          input,
          init,
          elevatedToken: data.data.token,
        }),
    } as {
      token: string;
      fetch: elevatedFetcher;
    };
  }
  /**
   * Verifies a TOTP code. This can be used to verify a TOTP code for risky operations without needing to exchange it for an elevated token.
   *
   * **Server side only**
   */
  async verify(token: string): Promise<boolean | TotpError> {
    const res = (await this.fetch(`${this.issuerURI}/totp/validate`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }).then((res) => res.json())) as TOTPResponse<null>;

    if (!res.success) {
      const err = new TotpError(
        res.error || "Request failed",
        "request_failed",
      );
      this.onError(err);
      return err;
    }
    return true;
  }
  /**
   * Verifies the elevated token from the request headers. This can be used in API routes to verify that the request has been elevated before performing risky operations.
   *
   * **Server side only**
   */
  async verifyFromRequest(request: Request): Promise<boolean | TotpError> {
    const token = request.headers.get("x-elevated-token");
    if (!token) {
      const err = new TotpError("No elevated token found", "request_failed");
      this.onError(err);
      return err;
    }
    return this.verify(token);
  }
  /**
   * Sets up TOTP for the user and returns the provisioning URI, secret and backup codes. The provisioning URI can be used to generate a QR code that can be scanned by an authenticator app.
   *
   * **Client Side**
   *
   * **Must call confirmSetup with a valid TOTP code within the next 5 minutes to complete the setup process.**
   */
  async setupTotp(): Promise<TOTPSetupData | TotpError> {
    const res = await this.fetch(`${this.issuerURI}/totp/setup`, {
      method: "POST",
    });

    const body = (await res.json()) as TOTPResponse<TOTPSetupData>;

    if (!res.ok || !body.success) {
      const err = new TotpError(
        body.error || "Request failed",
        "request_failed",
      );
      this.onError(err);
      return err;
    }

    return body.data;
  }
  /**
   * Confirms the TOTP setup by verifying the provided code. This should be called after setupTotp to complete the TOTP setup process.
   *
   * Must be called within 5 minutes of calling setupTotp, otherwise the setup will expire and the user will need to start the setup process again.
   *
   * **Client Side**
   */
  async confirmSetup({
    code,
    onError,
  }: {
    code: string;
    onError?: (err: TotpError) => void;
  }): Promise<boolean> {
    const res = (await this.fetch(`${this.issuerURI}/totp/confirm`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }).then((res) => res.json())) as {
      success: boolean;
      error?: TotpError["type"];
    };

    if (!res.success) {
      const err = new TotpError(
        res.error || "Request failed",
        "request_failed",
      );
      this.onError(err);
      onError?.(err);
      return false;
    }
    return true;
  }
  /**
   * Performs a fetch request with an elevated token. This can be used to perform actions that require elevated privileges.
   *
   * **Client Side**
   */
  elevatedFetch({
    input,
    init,
    elevatedToken,
  }: {
    input: RequestInfo;
    init?: RequestInit;
    elevatedToken: string;
  }): Promise<Response> {
    const headers = new Headers(init?.headers || {});
    headers.set("x-elevated-token", elevatedToken);

    return this.fetch(input, { ...init, headers });
  }
  /**
   * Removes the TOTP setup for a user. This should be used in cases where the user has lost access to their TOTP device and needs to remove the TOTP requirement from their account.
   *
   * **Server Side Only**
   *
   * **App Secret must be provided**
   */
  removeMFAById(userID: string) {
    return this.fetch(`${this.issuerURI}/admin/totp/${userID}`, {
      method: "DELETE",
    }).then((res) => res.json() as Promise<TOTPResponse<null>>);
  }
  /**
   * Removes the TOTP setup for a user using a backup code. This should be used in cases where the user has lost access to their TOTP device and needs to remove the TOTP requirement from their account, but does not have access to the app secret.
   */
  removeMFAWithBackupCode(backupCode: string) {
    return this.fetch(`${this.issuerURI}/totp/remove`, {
      method: "POST",
      body: JSON.stringify({ code: backupCode }),
    }).then((res) => res.json() as Promise<TOTPResponse<null>>);
  }
  /**
   * Removes the TOTP setup for a user using an elevated token OR a valid TOTP code.
   */
  removeMFAWithElevatedToken({
    elevatedToken,
    TOTPCode,
  }:
    | {
        elevatedToken?: string;
        TOTPCode?: undefined;
      }
    | { elevatedToken?: undefined; TOTPCode: string }): Promise<
    TOTPResponse<null>
  > {
    if (elevatedToken)
      return this.elevatedFetch({
        input: `${this.issuerURI}/totp/remove`,
        init: { method: "POST" },
        elevatedToken,
      }).then((res) => res.json() as Promise<TOTPResponse<null>>);
    else if (TOTPCode)
      return this.getElevatedToken(TOTPCode).then((res) => {
        if (res instanceof TotpError) {
          return {
            success: false,
            error: res.type,
            error_description: res.message,
          } as TOTPResponse<null>;
        } else if (!res) {
          return {
            success: false,
            error: "invalid_code",
            error_description: "Invalid TOTP code",
          } as TOTPResponse<null>;
        }
        return this.removeMFAWithElevatedToken({
          elevatedToken: res?.token,
        }).then((res) => res);
      });
    else throw new Error("Either elevatedToken or TOTPCode must be provided");
  }
  /**
   * Resets the TOTP setup for a user using a backup code. This should be used in cases where the user has lost access to their TOTP device and needs to reset the TOTP setup for their account, but does not have access to the app secret. This will generate a new TOTP secret and backup codes for the user.
   *
   * the user must confirm setup of the new TOTP secret by calling confirmSetup with a valid TOTP code generated from the new secret within 5 minutes, otherwise the reset will expire and the user will need to start the reset process again.
   *
   * **Client Side**
   */
  resetMFAWithBackupCode(backupCode: string) {
    return this.fetch(`${this.issuerURI}/totp/reset`, {
      method: "POST",
      body: JSON.stringify({ code: backupCode }),
    }).then(
      (res) => res.json() as Promise<TOTPResponse<TOTPBackupRestoreData>>,
    );
  }
  /**
   * Verifies a TOTP code without exchanging it for an elevated token. This can be used for operations that require TOTP verification but do not necessarily require elevated access, such as confirming a sensitive action or accessing a protected resource.
   *
   * Or for a single step TOTP verification and action flow, where the user enters their TOTP code and if it's valid, a certain action is performed without needing to manage elevated tokens on the client side.
   *
   * **Client Side**
   */
  verifyTOTPCode(code: string): Promise<boolean | TotpError> {
    return this.fetch(`${this.issuerURI}/totp/verify`, {
      method: "POST",
      body: JSON.stringify({ code }),
    })
      .then((res) => res.json() as Promise<TOTPResponse<null>>)
      .then((data) => {
        if (!data.success) {
          const err = new TotpError(
            data.error || "Request failed",
            "request_failed",
          );
          this.onError(err);
          return err;
        }
        return true;
      });
  }
}
