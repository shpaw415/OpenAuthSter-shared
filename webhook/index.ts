import type { WebHookConfig, WebHookEvents } from "./types";
import { drizzle, eq, and } from "../database/drizzle";
import { WebHookTable } from "../database/schema";

export class WebHook {
  private db: ReturnType<typeof drizzle>;
  private clientID: string;

  constructor({ db, clientID }: { db: D1Database; clientID: string }) {
    this.db = drizzle(db);
    this.clientID = clientID;
  }

  async register(event: WebHookEvents, config: WebHookConfig) {
    this.db
      .insert(WebHookTable)
      .values({
        id: crypto.randomUUID(),
        clientID: this.clientID,
        event,
        url: config.url,
        method: config.method,
        headers: config.headers ? JSON.stringify(config.headers) : undefined,
        created_at: new Date().toISOString(),
      })
      .run();
  }

  async getWebHooks() {
    return this.db
      .select()
      .from(WebHookTable)
      .where(eq(WebHookTable.clientID, this.clientID))
      .all();
  }

  async deleteWebHook(webHookID: string) {
    return this.db
      .delete(WebHookTable)
      .where(
        and(
          eq(WebHookTable.clientID, this.clientID),
          eq(WebHookTable.id, webHookID),
        ),
      )
      .run();
  }
  /**
   * Triggers all webhooks for a specific event with the given payload. It handles both POST and GET requests and logs any errors that occur during the process.
   */
  async trigger(event: WebHookEvents, payload: Record<string, any>) {
    const webhooks = await this.db
      .select()
      .from(WebHookTable)
      .where(
        and(
          eq(WebHookTable.clientID, this.clientID),
          eq(WebHookTable.event, event),
        ),
      )
      .all();

    return Promise.all(
      webhooks.map(async (webhook) => {
        const headers =
          typeof webhook.headers === "string"
            ? JSON.parse(webhook.headers as string)
            : webhook.headers || {};
        try {
          return await fetch(webhook.url, {
            method: webhook.method,
            headers: {
              "Content-Type": "application/json",
              ...headers,
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
}
