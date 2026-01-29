import type { PasswordUIOptions } from "@openauthjs/openauth/ui/password";
import type { CodeUICopy } from "@openauthjs/openauth/ui/code";
import type { CognitoConfig } from "@openauthjs/openauth/provider/cognito";
import type { KeycloakConfig } from "@openauthjs/openauth/provider/keycloak";
import type { MicrosoftConfig } from "@openauthjs/openauth/provider/microsoft";
import type { projectTable } from "./database/schema";
import type { OnSuccessResponder, Prettify } from "@openauthjs/openauth/issuer";

// All available provider types
export type ProviderType =
  | "code" //
  | "oidc"
  | "oauth"
  | "apple" //
  | "x" //
  | "slack"
  | "yahoo"
  | "google" //
  | "github" //
  | "twitch"
  | "spotify"
  | "cognito"
  | "discord"
  | "facebook" //
  | "keycloak"
  | "password" //
  | "microsoft"
  | "jumpcloud";

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
    | "apple"
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

export interface CognitoProviderConfig extends BaseProviderConfig {
  type: "cognito";
  data: CognitoConfig;
}

export interface GoogleProviderConfig extends BaseProviderConfig {
  type: "google";
  data: {
    clientID: string;
    clientSecret: string;
    scopes?: string[];
    pkce?: boolean;
    query?: Record<string, string>;
  };
}

export interface SlackProviderConfig extends BaseProviderConfig {
  type: "slack";
  data: {
    clientID: string;
    clientSecret: string;
    scopes?: string[];
    team: string;
    pkce?: boolean;
  };
}

// OIDC provider configuration
export interface OIDCProviderConfig extends BaseProviderConfig {
  type: "oidc";
  data: {
    clientID: string;
    issuer: string;
    scopes?: string[];
    query?: Record<string, string>;
  };
}

// Generic OAuth provider configuration
export interface GenericOAuthProviderConfig extends BaseProviderConfig {
  type: "oauth";
  data: {
    clientID: string;
    clientSecret: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    jwksEndpoint?: string;
    scopes?: string[];
    query?: Record<string, string>;
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
  data: {
    length?: number; // Default 6
  };
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
  | SlackProviderConfig;

// Provider metadata for UI
export interface ProviderMeta {
  type: ProviderType;
  name: string;
  category: ProviderCategory;
  icon: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
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
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "github",
    name: "GitHub",
    category: "social",
    icon: "⚫",
    description: "Sign in with GitHub OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "discord",
    name: "Discord",
    category: "social",
    icon: "💜",
    description: "Sign in with Discord OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "x",
    name: "X (Twitter)",
    category: "social",
    icon: "✖️",
    description: "Sign in with X OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "facebook",
    name: "Facebook",
    category: "social",
    icon: "📘",
    description: "Sign in with Facebook OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "apple",
    name: "Apple",
    category: "social",
    icon: "🍎",
    description: "Sign in with Apple",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "slack",
    name: "Slack",
    category: "social",
    icon: "💬",
    description: "Sign in with Slack OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "spotify",
    name: "Spotify",
    category: "social",
    icon: "🎵",
    description: "Sign in with Spotify OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "twitch",
    name: "Twitch",
    category: "social",
    icon: "🎮",
    description: "Sign in with Twitch OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "yahoo",
    name: "Yahoo",
    category: "social",
    icon: "🟣",
    description: "Sign in with Yahoo OAuth2",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  // Enterprise Providers
  {
    type: "microsoft",
    name: "Microsoft",
    category: "enterprise",
    icon: "🪟",
    description: "Sign in with Microsoft Azure AD",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "cognito",
    name: "AWS Cognito",
    category: "enterprise",
    icon: "☁️",
    description: "Sign in with AWS Cognito",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  {
    type: "keycloak",
    name: "Keycloak",
    category: "enterprise",
    icon: "🔐",
    description: "Sign in with Keycloak",
    requiredFields: ["clientID", "clientSecret", "realm", "baseUrl"],
    optionalFields: ["scopes"],
  },
  {
    type: "jumpcloud",
    name: "JumpCloud",
    category: "enterprise",
    icon: "☁️",
    description: "Sign in with JumpCloud",
    requiredFields: ["clientID", "clientSecret"],
    optionalFields: ["scopes"],
  },
  // Custom Providers
  {
    type: "oidc",
    name: "Custom OIDC",
    category: "custom",
    icon: "🔗",
    description: "Connect to any OIDC provider",
    requiredFields: ["clientID", "issuer"],
    optionalFields: ["scopes", "query"],
  },
  {
    type: "oauth",
    name: "Custom OAuth2",
    category: "custom",
    icon: "🔑",
    description: "Connect to any OAuth2 provider",
    requiredFields: [
      "clientID",
      "clientSecret",
      "authorizationEndpoint",
      "tokenEndpoint",
    ],
    optionalFields: ["jwksEndpoint", "scopes", "query"],
  },
  // Form-based Providers
  {
    type: "code",
    name: "Pin Code",
    category: "form",
    icon: "📧",
    description: "Email or SMS verification code",
    requiredFields: ["mode"],
    optionalFields: ["length"],
  },
  {
    type: "password",
    name: "Password",
    category: "form",
    icon: "🔒",
    description: "Traditional email and password",
    requiredFields: [],
    optionalFields: [
      "minLength",
      "requireUppercase",
      "requireNumber",
      "requireSpecialChar",
    ],
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

// Create default provider config
export function createDefaultProviderConfig(
  type: ProviderType,
): ProviderConfig {
  const base: BaseProviderConfig = {
    type,
    enabled: false,
  };

  switch (type) {
    case "code":
      return {
        ...base,
        type: "code",
        data: { length: 6, mode: "email" },
      } as CodeProviderConfig;
    case "password":
      return {
        ...base,
        type: "password",
        data: {
          minLength: 8,
          requireUppercase: true,
          requireNumber: true,
          requireSpecialChar: false,
        },
      } as PasswordProviderConfig;
    case "oidc":
      return {
        ...base,
        type: "oidc",
        data: {
          clientID: "",
          issuer: "",
          scopes: ["openid", "email", "profile"],
        },
      } as OIDCProviderConfig;
    case "oauth":
      return {
        ...base,
        type: "oauth",
        data: {
          clientID: "",
          clientSecret: "",
          authorizationEndpoint: "",
          tokenEndpoint: "",
          scopes: [],
        },
      } as GenericOAuthProviderConfig;
    case "keycloak":
      return {
        ...base,
        type: "keycloak",
        data: {
          clientID: "",
          clientSecret: "",
          realm: "",
          baseUrl: "",
          scopes: ["openid", "email", "profile"],
        },
      } as KeycloakProviderConfig;
    default:
      return {
        ...base,
        type,
        data: { clientID: "", clientSecret: "", scopes: [] },
      } as OAuth2ProviderConfig;
  }
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

// Project type
export interface Project {
  clientID: string;
  created_at: string;
  active: boolean;
  providers_data: ProviderConfig[];
  themeId?: string | null;
  emailTemplateId?: string | null;
  codeMode: "email" | "phone";
  projectData?: ProjectData;
  originURL?: string | null;
}

export function parseDBProject(
  data: typeof projectTable.$inferSelect,
): Project {
  return {
    ...data,
    clientID: String(data.clientID),
    created_at: String(data.created_at),
    active: Boolean(data.active),
    providers_data:
      typeof data.providers_data === "string"
        ? JSON.parse(data.providers_data)
        : data.providers_data,
    themeId: data.themeId || null,
    emailTemplateId: data.emailTemplateId || null,
    codeMode: String(data.codeMode) === "phone" ? "phone" : "email",
    projectData:
      typeof data.projectData === "string"
        ? JSON.parse(data.projectData)
        : data.projectData || {},
    originURL: data.originURL || null,
  } satisfies Project;
}

type CopyData = CodeUICopy | PasswordUIOptions["copy"];

export type CopyDataSelection = {
  password: PasswordUIOptions["copy"];
  code: CodeUICopy;
};

export function parseDBCopyTemplate<T extends CopyData>(data: any) {
  return {
    name: String(data.name),
    providerType: String(data.providerType),
    copyData: (typeof data.copyData === "string"
      ? JSON.parse(data.copyData)
      : data.copyData) as T,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  };
}

// Global configuration for external integrations
export type ExternalGlobalProjectConfig = {
  register: {
    fallbackEmailFrom: string;
    onSuccessfulRegistration?: (
      ctx: OnSuccessResponder<
        Prettify<{
          type: "user";
          properties: {
            id: string;
          };
        }>
      >,
      value: Record<string, any>,
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

export function createExternalGlobalProjectConfig(
  config: ExternalGlobalProjectConfig,
): ExternalGlobalProjectConfig {
  return config;
}

export const COOKIE_NAME = "oauth_client_id" as const;
export const COOKIE_COPY_TEMPLATE_ID = "oauth_copy_template_id" as const;
