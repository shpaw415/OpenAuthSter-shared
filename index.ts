import type { OnSuccessResponder, Prettify } from "@kagii/openauth/issuer";
import type {
	AppleConfig,
	AppleOidcConfig,
} from "@kagii/openauth/provider/apple";
import type { CodeProviderConfig as CodeConfig } from "@kagii/openauth/provider/code";
import type { CognitoConfig } from "@kagii/openauth/provider/cognito";
import type { GoogleConfig } from "@kagii/openauth/provider/google";
import type { KeycloakConfig } from "@kagii/openauth/provider/keycloak";
import type { MicrosoftConfig } from "@kagii/openauth/provider/microsoft";
import type { Oauth2Config } from "@kagii/openauth/provider/oauth2";
import type { OidcConfig } from "@kagii/openauth/provider/oidc";
import type { SlackConfig } from "@kagii/openauth/provider/slack";
import type { CodeUICopy } from "@kagii/openauth/ui/code";
import type { PasswordUIOptions } from "@kagii/openauth/ui/password";
import type { projectTable } from "./database/schema";
import type { PASSKEY_DEFAULT_COPY } from "./providers/custom/passkey/index";
// custom Provider types
import type { DEFAULT_COPY as QR_DEFAULT_COPY } from "./providers/custom/qr";

export * from "./database/schema";

// All available provider types
export type ProviderType =
	| "code"
	| "oidc"
	| "oauth"
	| "appleoauth"
	| "appleoidc"
	| "apple"
	| "x"
	| "slack"
	| "yahoo"
	| "google"
	| "github"
	| "twitch"
	| "spotify"
	| "cognito"
	| "discord"
	| "facebook"
	| "keycloak"
	| "password"
	| "microsoft"
	| "jumpcloud"
	| "qr"
	| "passkey";

// Provider category for UI organization
export type ProviderCategory = "social" | "enterprise" | "custom" | "form";

// Base provider configuration
export interface BaseProviderConfig {
	type: ProviderType;
	enabled: boolean;
}

// OAuth2-based provider configuration
export interface OAuth2ProviderConfig extends BaseProviderConfig {
	type:
		| "x"
		| "spotify"
		| "discord"
		| "facebook"
		| "github"
		| "twitch"
		| "yahoo"
		| "jumpcloud";
	data: {
		clientID: string;
		clientSecret: string;
		scopes?: string[];
		pkce?: boolean;
		query?: Record<string, string>;
	};
}

export interface MicrosoftProviderConfig extends BaseProviderConfig {
	type: "microsoft";
	data: MicrosoftConfig;
}

export interface AppleOAuthProviderConfig extends BaseProviderConfig {
	type: "appleoauth";
	data: AppleConfig & { responseMode?: "form_post" | "query" };
}

export interface AppleOIDCProviderConfig extends BaseProviderConfig {
	type: "appleoidc";
	data: AppleOidcConfig;
}

export interface CognitoProviderConfig extends BaseProviderConfig {
	type: "cognito";
	data: CognitoConfig;
}

export interface GoogleProviderConfig extends BaseProviderConfig {
	type: "google";
	data: GoogleConfig;
}

export interface SlackProviderConfig extends BaseProviderConfig {
	type: "slack";
	data: SlackConfig;
}

// OIDC provider configuration
export interface OIDCProviderConfig extends BaseProviderConfig {
	type: "oidc";
	data: OidcConfig;
}

// Generic OAuth provider configuration
export interface GenericOAuthProviderConfig extends BaseProviderConfig {
	type: "oauth";
	data: Oauth2Config & {
		userInfoGetter: {
			url: string;
			method: "GET" | "POST";
			headers?: Record<string, string>;
			idPath: string; // Dot notation path to extract user identifier from user info response
		};
	};
}

// Keycloak provider configuration
export interface KeycloakProviderConfig extends BaseProviderConfig {
	type: "keycloak";
	data: KeycloakConfig;
}

// Code provider configuration (email/SMS pin code)
export interface CodeProviderConfig extends BaseProviderConfig {
	type: "code";
	data: CodeConfig<any> & { mode: "email" | "phone" };
}

// Password provider configuration
export interface PasswordProviderConfig extends BaseProviderConfig {
	type: "password";
	data: {
		minLength?: number;
		shortPasswordMsg?: string;
		requireUppercase?: boolean;
		requireUppercaseMsg?: string;
		requireNumber?: boolean;
		requireNumberMsg?: string;
		requireSpecialChar?: boolean;
		requireSpecialCharMsg?: string;
	};
}

// QR Code provider configuration
export interface QRProviderConfig extends BaseProviderConfig {
	type: "qr";
	data: {
		requireMFA: boolean;
	};
}

// WebAuthn provider configuration
export interface WebAuthnProviderConfig extends BaseProviderConfig {
	type: "passkey";
	data: {};
}

// Union type for all provider configurations
export type ProviderConfig =
	| OAuth2ProviderConfig
	| OIDCProviderConfig
	| GenericOAuthProviderConfig
	| KeycloakProviderConfig
	| CodeProviderConfig
	| PasswordProviderConfig
	| GoogleProviderConfig
	| CognitoProviderConfig
	| MicrosoftProviderConfig
	| AppleOIDCProviderConfig
	| AppleOAuthProviderConfig
	| SlackProviderConfig
	| QRProviderConfig
	| WebAuthnProviderConfig;

// Provider metadata for UI
export interface ProviderMeta {
	type: ProviderType;
	name: string;
	category: ProviderCategory;
	icon: string;
	description: string;
}

export type EmailTemplateProps = {
	name: string;
	body: string;
	subject: string;
};

// All available providers with their metadata
export const PROVIDER_REGISTRY: ProviderMeta[] = [
	// Social Providers
	{
		type: "google",
		name: "Google",
		category: "social",
		icon: "🔵",
		description: "Sign in with Google OAuth2",
	},
	{
		type: "github",
		name: "GitHub",
		category: "social",
		icon: "⚫",
		description: "Sign in with GitHub OAuth2",
	},
	{
		type: "discord",
		name: "Discord",
		category: "social",
		icon: "💜",
		description: "Sign in with Discord OAuth2",
	},
	{
		type: "x",
		name: "X (Twitter)",
		category: "social",
		icon: "✖️",
		description: "Sign in with X OAuth2",
	},
	{
		type: "facebook",
		name: "Facebook",
		category: "social",
		icon: "📘",
		description: "Sign in with Facebook OAuth2",
	},
	{
		type: "appleoauth",
		name: "Apple OAuth2",
		category: "social",
		icon: "🍎",
		description: "Sign in with Apple OAuth2",
	},
	{
		type: "appleoidc",
		name: "Apple OIDC",
		category: "social",
		icon: "🍏",
		description: "Sign in with Apple OIDC",
	},
	{
		type: "slack",
		name: "Slack",
		category: "social",
		icon: "💬",
		description: "Sign in with Slack OAuth2",
	},
	{
		type: "spotify",
		name: "Spotify",
		category: "social",
		icon: "🎵",
		description: "Sign in with Spotify OAuth2",
	},
	{
		type: "twitch",
		name: "Twitch",
		category: "social",
		icon: "🎮",
		description: "Sign in with Twitch OAuth2",
	},
	{
		type: "yahoo",
		name: "Yahoo",
		category: "social",
		icon: "🟣",
		description: "Sign in with Yahoo OAuth2",
	},
	// Enterprise Providers
	{
		type: "microsoft",
		name: "Microsoft",
		category: "enterprise",
		icon: "🪟",
		description: "Sign in with Microsoft Azure AD",
	},
	{
		type: "cognito",
		name: "AWS Cognito",
		category: "enterprise",
		icon: "☁️",
		description: "Sign in with AWS Cognito",
	},
	{
		type: "keycloak",
		name: "Keycloak",
		category: "enterprise",
		icon: "🔐",
		description: "Sign in with Keycloak",
	},
	{
		type: "jumpcloud",
		name: "JumpCloud",
		category: "enterprise",
		icon: "☁️",
		description: "Sign in with JumpCloud",
	},
	// Custom Providers
	{
		type: "oidc",
		name: "Custom OIDC",
		category: "custom",
		icon: "🔗",
		description: "Connect to any OIDC provider",
	},
	{
		type: "oauth",
		name: "Custom OAuth2",
		category: "custom",
		icon: "🔑",
		description: "Connect to any OAuth2 provider",
	},
	// Form-based Providers
	{
		type: "code",
		name: "Pin Code",
		category: "form",
		icon: "📧",
		description: "Email or SMS verification code",
	},
	{
		type: "password",
		name: "Password",
		category: "form",
		icon: "🔒",
		description: "Traditional email and password",
	},
	{
		type: "qr",
		name: "QR Code",
		category: "custom",
		icon: "📱",
		description:
			"Authenticate by scanning a QR code with your authenticated mobile device",
	},
	{
		type: "passkey",
		name: "WebAuthn Passkey",
		category: "custom",
		icon: "🔑",
		description: "Sign in with WebAuthn Passkey",
	},
];

// Helper function to get provider metadata
export function getProviderMeta(type: ProviderType): ProviderMeta | undefined {
	return PROVIDER_REGISTRY.find((p) => p.type === type);
}

// Helper function to get providers by category
export function getProvidersByCategory(
	category: ProviderCategory,
): ProviderMeta[] {
	return PROVIDER_REGISTRY.filter((p) => p.category === category);
}

// Project data for email templates and customization
export interface ProjectData {
	appName?: string;
	companyName?: string;
	supportEmail?: string;
	websiteUrl?: string;
	logoUrl?: string;
	primaryColor?: string;
	emailFrom?: string;
	[key: string]: string | undefined;
}

type EnsureKeys<T, K extends keyof T> = T & { [P in K]-?: T[P] };

// Project type
export type Project = EnsureKeys<
	{
		name: string;
		clientID: string;
		owner_id: string;
		owner_group_id: string;
		active: boolean;
		providers_data: ProviderConfig[];
		theme_id: number | null;
		emailTemplateId?: number | null;
		codeMode: "email" | "phone";
		projectData?: ProjectData;
		originURL?: string | null;
		authEndpointURL: string;
		cloudflareDomaineID: string;
		registerOnInvite: boolean;
		secret: string;
		created_at: string;
	},
	keyof typeof projectTable.$inferSelect
>;

export type CopyData =
	| CodeUICopy
	| PasswordUIOptions["copy"]
	| typeof QR_DEFAULT_COPY
	| typeof PASSKEY_DEFAULT_COPY;

export type CopyDataSelection = {
	password: PasswordUIOptions["copy"];
	code: CodeUICopy;
	qr: typeof QR_DEFAULT_COPY;
	passkey: typeof PASSKEY_DEFAULT_COPY;
};

// Global configuration for external integrations
export type ExternalGlobalProjectConfig<CTXProperties = unknown> = {
	register: {
		fallbackEmailFrom: string;
		onSuccessfulRegistration?: (
			ctx: OnSuccessResponder<
				Prettify<{
					type: "user";
					properties: CTXProperties;
				}>
			>,
			value: Record<string, unknown>,
			request: Request,
		) => Promise<void> | void;
		strategy: Partial<{
			email: EGPCEmail;
			phone: EGPCPhone;
		}>;
	};
};

export type EGPCEmail =
	| {
			provider: "resend";
			apiKey: string;
	  }
	| {
			provider: "custom";
			sendEmailFunction: (to: string, code: string) => Promise<void> | void;
	  };

export type EGPCPhone =
	| {
			provider: "twilio";
			accountSID: string;
			authToken: string;
			fromNumber: string;
	  }
	| {
			provider: "custom";
			sendSMSFunction: (to: string, code: string) => Promise<void> | void;
	  };

export function createExternalGlobalProjectConfig<CTXProperties = unknown>(
	config: ExternalGlobalProjectConfig<CTXProperties>,
): ExternalGlobalProjectConfig<CTXProperties> {
	return config;
}

export const COOKIE_NAME = "oauth_client_id" as const;
export const COOKIE_COPY_TEMPLATE_ID = "oauth_copy_template_id" as const;
export const COOKIE_INVITE_ID = "oauth_invite_id" as const;

export const PUBLIC_CLIENT_ID = "openauth_webui" as const;
