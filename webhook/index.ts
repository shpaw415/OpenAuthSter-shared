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
    this.db
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
      .run();
  }

  async getWebHooks(clientID: string) {
    return this.db
      .select()
      .from(WebHookTable)
      .where(eq(WebHookTable.clientID, clientID))
      .all();
  }

  async deleteWebHook(webHookID: string) {
    return this.db
      .delete(WebHookTable)
      .where(and(eq(WebHookTable.id, webHookID)))
      .run();
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
    config: WebHookConfig,
  ): Partial<typeof WebHookTable.$inferInsert> {
    return {
      ...config,
      headers: config.headers ? JSON.stringify(config.headers) : undefined,
    };
  }
  retriveWebHookFromIssuer({
    clientID,
    webHookID,
    issuerURI,
    secret,
  }: {
    clientID: string;
    webHookID: string;
    issuerURI: string;
    secret: string;
  }) {
    return fetch(`${issuerURI}/webhook/${clientID}/${webHookID}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-secret": secret,
      },
    }).then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to retrieve webhook: ${res.statusText}`);
      }
      return res.json() as unknown as WebHookPayLoad;
    });
  }

  static create(config: { db: D1Database }) {
    return new WebHook(config);
  }
}
