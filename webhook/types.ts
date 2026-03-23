import type { ProviderType } from "../";

export type WebHookEvents = (typeof WebHookEventsList)[number];
export const WebHookEventsList = [
	"registration_success",
	"login_success",
	"login_attempt",
	"password_reset",
	"code_sent",
	"mfa_setup",
	"mfa_update",
	"mfa_confirmed",
	"mfa_removed",
] as const;

export const WebHookEventsDetails: Array<{
	event: WebHookEvents;
	description: string;
	label: string;
}> = [
	{
		event: "registration_success",
		description: "Triggered when a user successfully registers.",
		label: "Registration Success",
	},
	{
		event: "login_success",
		description: "Triggered when a user successfully logs in.",
		label: "Login Success",
	},
	{
		event: "login_attempt",
		description: "Triggered when a user attempts to log in.",
		label: "Login Attempt",
	},
	{
		event: "password_reset",
		description: "Triggered when a user resets their password.",
		label: "Password Reset",
	},
	{
		event: "code_sent",
		description: "Triggered when a verification code is sent to a user.",
		label: "Code Sent",
	},
	{
		event: "mfa_setup",
		description:
			"Triggered when a user sets up MFA (Multi-Factor Authentication).",
		label: "MFA Setup",
	},
	{
		event: "mfa_update",
		description: "Triggered when a user updates their MFA settings.",
		label: "MFA Update",
	},
	{
		event: "mfa_confirmed",
		description: "Triggered when a user confirms MFA setup.",
		label: "MFA Confirmed",
	},
	{
		event: "mfa_removed",
		description: "Triggered when a user removes MFA from their account.",
		label: "MFA Removed",
	},
];

export type WebHookConfig = {
	url: string;
	method: "POST" | "GET";
	headers?: Record<string, string>;
	event: WebHookEvents;
};

export type ExtendedWebHookConfig = WebHookConfig & {
	id: string;
	clientID: string;
	created_at: string;
};

export type WebHookPayLoad<
	Event extends WebHookEvents,
	Data extends Record<string, unknown> = {},
> = {
	event: Event;
	clientID: string;
	timestamp: string;
	id: string;
	data: Data;
	meta: {
		ip: string;
		userAgent: string;
	};
};

export type WebHookPayloadCodeSent = WebHookPayLoad<
	"code_sent",
	{
		code: string;
		method: "email" | "phone";
		send_to: string;
	}
>;

export type WebHookPayloadLoginSuccess = WebHookPayLoad<
	"login_success",
	{
		userID: string;
		provider: ProviderType;
	}
>;

export type WebHookPayloadRegistrationSuccess = WebHookPayLoad<
	"registration_success",
	{
		userID: string;
		provider: ProviderType;
	}
>;

// not implemented yet, but can be used in the future to send additional data related to password reset events
export type WebHookPayloadPasswordReset = WebHookPayLoad<
	"password_reset",
	{
		userID: string;
	}
>;

export type WebHookPayloadMFASetup = WebHookPayLoad<
	"mfa_setup",
	{
		userID: string;
	}
>;

export type WebHookPayloadMFAConfirmed = WebHookPayLoad<
	"mfa_confirmed",
	{
		userID: string;
	}
>;

export type WebHookPayloadMFARemoved = WebHookPayLoad<
	"mfa_removed",
	{
		userID: string;
		method: "token" | "backup_code";
	}
>;

export type WebHookPayloadMFAUpdate = WebHookPayLoad<
	"mfa_update",
	{
		userID: string;
		method: "backup_code";
	}
>;

export type WebHooksPayloads = {
	code_sent: WebHookPayloadCodeSent["data"];
	login_success: WebHookPayloadLoginSuccess["data"];
	registration_success: WebHookPayloadRegistrationSuccess["data"];
	password_reset: WebHookPayloadPasswordReset["data"];
	mfa_setup: WebHookPayloadMFASetup["data"];
	mfa_confirmed: WebHookPayloadMFAConfirmed["data"];
	mfa_removed: WebHookPayloadMFARemoved["data"];
	mfa_update: WebHookPayloadMFAUpdate["data"];
};
