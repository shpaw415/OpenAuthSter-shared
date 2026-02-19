export type WebHookEvents =
  | "registration_success"
  | "login_success"
  | "password_reset"
  | "code_sent";

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

export type WebHookPayLoad = {
  event: WebHookEvents;
  clientID: string;
  timestamp: string;
  id: string;
};
