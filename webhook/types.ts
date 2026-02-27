export const WebHookEventsList = [
  "registration_success",
  "login_success",
  "password_reset",
  "code_sent",
  "totp_setup",
  "totp_confirmed",
] as const;

export type WebHookEvents = (typeof WebHookEventsList)[number];

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
