export type WebHookEvents = (typeof WebHookEventsList)[number];
export const WebHookEventsList = [
  "registration_success",
  "login_success",
  "password_reset",
  "code_sent",
  "totp_setup",
  "totp_confirmed",
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
    event: "totp_setup",
    description:
      "Triggered when a user sets up TOTP (Time-based One-Time Password).",
    label: "TOTP Setup",
  },
  {
    event: "totp_confirmed",
    description: "Triggered when a user confirms TOTP setup.",
    label: "TOTP Confirmed",
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

export type WebHookPayLoad<Data extends Record<string, any> = {}> = {
  event: WebHookEvents;
  clientID: string;
  timestamp: string;
  id: string;
  data: Data;
};

export type WebHookPayloadCodeSent = WebHookPayLoad<{
  claim: Record<string, any>;
  code: string;
}>;

export type WebHookPayloadLoginSuccess = WebHookPayLoad<{
  claim: Record<string, any>;
}>;

export type WebHookPayloadRegistrationSuccess = WebHookPayLoad<{
  claim: Record<string, any>;
}>;

// not implemented yet, but can be used in the future to send additional data related to password reset events
export type WebHookPayloadPasswordReset = WebHookPayLoad<{
  claim: Record<string, any>;
}>;

export type WebHookPayloadTotpSetup = WebHookPayLoad<{
  user_id: string;
}>;

export type WebHookPayloadTotpConfirmed = WebHookPayLoad<{
  user_id: string;
}>;
