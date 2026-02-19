import type {
  WebHookConfig,
  WebHookEvents,
  ExtendedWebHookConfig,
  WebHookPayLoad,
} from "./types";
import { drizzle, eq, and } from "../database/drizzle";
import { WebHookTable } from "../database/schema";

export class WebHook {
  private db: ReturnType<typeof drizzle>;

  constructor({ db }: { db: D1Database }) {
    this.db = drizzle(db);
  }

  async register({
    event,
    config,
    clientID,
  }: {
    event: WebHookEvents;
    config: WebHookConfig;
    clientID: string;
  }) {
    return this.db
      .insert(WebHookTable)
      .values({
        id: crypto.randomUUID(),
        clientID: clientID,
        event,
        url: config.url,
        method: config.method,
        headers: config.headers ? JSON.stringify(config.headers) : undefined,
        created_at: new Date().toISOString(),
      })
      .returning()
      .then((c) => this.parseWebHookConfig(c[0]!));
  }
  async update({
    webHookID,
    config,
  }: {
    webHookID: string;
    config: Partial<WebHookConfig>;
  }) {
    return this.db
      .update(WebHookTable)
      .set({
        ...this.stringifyWebHookConfig(config),
      })
      .where(and(eq(WebHookTable.id, webHookID)))
      .returning()
      .then((c) => this.parseWebHookConfig(c[0]!));
  }

  async getWebHooks(
    clientID: string,
    filters?: Partial<{ event: WebHookEvents; id: string }>,
  ) {
    return this.db
      .select()
      .from(WebHookTable)
      .where(
        filters?.id
          ? eq(WebHookTable.id, filters.id)
          : filters?.event
            ? and(
                eq(WebHookTable.event, filters.event),
                eq(WebHookTable.clientID, clientID),
              )
            : eq(WebHookTable.clientID, clientID),
      )
      .all()
      .then((res) => res.map((r) => this.parseWebHookConfig(r)));
  }

  async deleteWebHook(webHookID: string) {
    return this.db
      .delete(WebHookTable)
      .where(and(eq(WebHookTable.id, webHookID)))
      .run() as unknown as Promise<void>;
  }
  /**
   * Triggers all webhooks for a specific event with the given payload. It handles both POST and GET requests and logs any errors that occur during the process.
   *
   * **Internal use only**
   */
  async trigger(
    clientID: string,
    event: WebHookEvents,
    payload: WebHookPayLoad,
    secret: string,
  ) {
    const webhooks = await this.db
      .select()
      .from(WebHookTable)
      .where(
        and(eq(WebHookTable.clientID, clientID), eq(WebHookTable.event, event)),
      )
      .all();

    return Promise.all(
      webhooks.map(this.parseWebHookConfig).map(async (webhook) => {
        try {
          return await fetch(webhook.url, {
            method: webhook.method,
            headers: {
              "Content-Type": "application/json",
              "x-secret": secret,
              ...webhook.headers,
            },
            body: JSON.stringify(payload),
          }).then((res) => {
            if (!res.ok) {
              throw new Error(
                `Failed to trigger webhook ${webhook.id}: ${res.statusText}`,
              );
            }
            return {
              success: true,
              id: webhook.id,
            };
          });
        } catch (error) {
          console.error(`Failed to trigger webhook ${webhook.id}:`, error);
          return {
            success: false,
            error: error,
            id: webhook.id,
          };
        }
      }),
    );
  }
  /**
   * Extracts the webhook payload from an incoming request after verifying its authenticity. It checks for a secret value in the request headers to ensure that the request is legitimate before parsing and returning the JSON payload. This method is intended to be used internally when handling incoming webhook requests.
   */
  async getWebHookPayloadFromRequest(
    request: Request,
    appSecret: string,
  ): Promise<WebHookPayLoad> {
    this.ensureAuthenticity(request, appSecret);
    return request.json() as Promise<WebHookPayLoad>;
  }

  parseWebHookConfig(
    raw: typeof WebHookTable.$inferSelect,
  ): ExtendedWebHookConfig {
    return {
      id: raw.id,
      clientID: raw.clientID,
      url: raw.url,
      method: raw.method as WebHookConfig["method"],
      created_at: raw.created_at,
      event: raw.event as WebHookEvents,
      headers: raw.headers ? JSON.parse(raw.headers as string) : undefined,
    };
  }
  stringifyWebHookConfig(
    config: Partial<WebHookConfig>,
  ): Partial<typeof WebHookTable.$inferInsert> {
    return {
      ...config,
      headers: config.headers ? JSON.stringify(config.headers) : undefined,
    };
  }

  /**
   * Verifies the authenticity of an incoming webhook request by comparing a secret value in the headers with a known secret. This method is intended to be used internally to ensure that incoming webhook requests are legitimate and originate from the expected source.
   */
  private ensureAuthenticity(request: Request, secret: string): boolean {
    const reqSecret = request.headers.get("x-secret");
    if (reqSecret !== secret) {
      throw new Error("Unauthorized webhook request");
    }
    return true;
  }

  static create(config: { db: D1Database }) {
    return new WebHook(config) as Omit<
      WebHook,
      | "trigger"
      | "register"
      | "update"
      | "deleteWebHook"
      | "getWebHooks"
      | "stringifyWebHookConfig"
      | "parseWebHookConfig"
    >;
  }
}
