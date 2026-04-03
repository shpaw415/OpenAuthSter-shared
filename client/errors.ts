import type { InvalidRefreshTokenError } from "@kagii/openauth/error";

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

export class TotpError extends Error {
	constructor(
		message: string,
		public type:
			| "invalid_code"
			| "totp_not_setup"
			| "request_failed"
			| "failed_to_generate_token"
			| "invalid_token"
			| "invalid_backup_code"
			| "totp_token_expired"
			| "totp_setup_expired"
			| "totp_already_setup"
			| "totp_token_not_found"
			| "totp_backup_code_invalid",
		public originalError?: Error,
	) {
		super(message);
		this.name = "TotpError";
	}
}

export type ErrorList =
	| CallbackError
	| RefreshError
	| TokenVerificationError
	| InvalidRefreshTokenError
	| TotpError;

export default {
	CallbackError,
	RefreshError,
	TokenVerificationError,
	TotpError,
};
