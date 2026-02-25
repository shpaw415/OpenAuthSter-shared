import type { InvalidRefreshTokenError } from "@openauthjs/openauth/error";

export class CallbackError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "CallbackError";
  }
}

export class RefreshError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
    public type: "missing_refresh_token" | "refresh_failed" = "refresh_failed",
  ) {
    super(message);
    this.name = "RefreshError";
  }
}

export class TokenVerificationError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

export type ErrorList =
  | CallbackError
  | RefreshError
  | TokenVerificationError
  | InvalidRefreshTokenError
  | InvalidRefreshTokenError;

export default {
  CallbackError,
  RefreshError,
  TokenVerificationError,
};
