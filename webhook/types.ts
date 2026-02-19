export type WebHookEvents =
  | "registration_success"
  | "login_success"
  | "password_reset"
  | "code_sent";

export type WebHookConfig = {
  url: string;
  method: "POST" | "GET";
  headers?: Record<string, string>;
};
