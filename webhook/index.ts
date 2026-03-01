import type {
  WebHookConfig,
  WebHookEvents,
  ExtendedWebHookConfig,
  WebHookPayLoad,
} from "./types";
import { drizzle, eq, and } from "../database/drizzle";
import { insertLog, WebHookTable } from "../database/schema";
import { hashWithSecretKey, verifySignature } from "../security/encryption";
import type { WebHooksPayloads } from "./types";

export class WebHookUnAuthorizedError extends Error {
  constructor(message?: string) {
    super(message || "Unauthorized webhook request");
    this.name = "WebHookUnAuthorizedError";
  }
}

export class WebHook {
  private db: ReturnType<typeof drizzle>;
  private rawDB: D1Database;

  constructor({ db }: { db: D1Database }) {
    this.db = drizzle(db);
    this.rawDB = db;
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
  async trigger<
    Event extends WebHookEvents,
    DataType extends Event extends keyof WebHooksPayloads
      ? WebHooksPayloads[Event]
      : Record<string, any>,
  >({
    clientID,
    event,
    secret,
    data,
    log = false,
    request,
  }: {
    clientID: string;
    event: Event;
    secret: string;
    data: DataType;
    log?: boolean;
    request: Request;
  }) {
    const webhooks = await this.db
      .select()
      .from(WebHookTable)
      .where(
        and(eq(WebHookTable.clientID, clientID), eq(WebHookTable.event, event)),
      )
      .all();

    const res: Array<
      | { success: true; id: string }
      | { success: false; error: Error; id: string }
    > = await Promise.all(
      webhooks.map(this.parseWebHookConfig).map(async (webhook) => {
        try {
          const fullPayload: WebHookPayLoad<any, any> = {
            id: webhook.id,
            timestamp: new Date().toISOString(),
            clientID: webhook.clientID,
            event: webhook.event,
            data,
            meta: {
              ip:
                request.headers.get("cf-connecting-ip") ||
                request.headers.get("x-real-ip") ||
                request.headers
                  .get("x-forwarded-for")
                  ?.split(",")
                  .at(0)
                  ?.trim() ||
                "unknown",
              userAgent: request.headers.get("user-agent") || "unknown",
            },
          };

          const url = new URL(webhook.url);
          if (webhook.method === "GET") {
            url.searchParams.set("payload", JSON.stringify(fullPayload));
          }

          return await fetch(url.toString(), {
            method: webhook.method,
            signal: AbortSignal.timeout(5000),
            headers: {
              "Content-Type": "application/json",
              "x-secret": await hashWithSecretKey(
                JSON.stringify(fullPayload),
                secret,
              ),
              ...webhook.headers,
            },
            body:
              webhook.method === "GET"
                ? undefined
                : JSON.stringify(fullPayload),
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
            error:
              error instanceof WebHookUnAuthorizedError
                ? error
                : new Error(String(error)),
            id: webhook.id,
          };
        }
      }),
    );

    const failedEvent = res
      .filter((r) => !r.success)
      .map((r) => ({
        id: r.id,
        error: r.error instanceof Error ? r.error.message : String(r.error),
      }));
    if (log && failedEvent.length > 0) {
      await insertLog({
        type: "warning",
        clientID,
        message: `Triggered webhooks for event ${event}. Some requests have failed.`,
        database: this.rawDB,
        context: {
          event,
          payload: data,
          results: failedEvent,
        },
      });
    }

    return res;
  }
  /**
   * Extracts the webhook payload from an incoming request after verifying its authenticity. It checks for a secret value in the request headers to ensure that the request is legitimate before parsing and returning the JSON payload. This method is intended to be used internally when handling incoming webhook requests.
   */
  static async getWebHookPayloadFromRequest<AwaitedEvent extends WebHookEvents>(
    event: AwaitedEvent,
    request: Request,
    appSecret: string,
  ): Promise<
    WebHookPayLoad<
      AwaitedEvent,
      AwaitedEvent extends keyof WebHooksPayloads
        ? WebHooksPayloads[AwaitedEvent]
        : Record<string, any>
    >
  > {
    const payload = await this.getPayLoadFromRequest(request);
    await this.ensureAuthenticity({
      request,
      secret: appSecret,
      data: payload,
    });

    const parsedPayload = JSON.parse(payload) as WebHookPayLoad<
      AwaitedEvent,
      AwaitedEvent extends keyof WebHooksPayloads
        ? WebHooksPayloads[AwaitedEvent]
        : Record<string, any>
    >;

    this.ensureTimeStamp(parsedPayload);
    return parsedPayload;
  }

  private static getPayLoadFromRequest(request: Request): Promise<string> {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const payload = url.searchParams.get("payload");
      if (!payload) {
        throw new Error("Missing payload in webhook request");
      }
      return Promise.resolve(payload);
    }
    return request.text();
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
   * Verifies the authenticity of an incoming webhook request by comparing
   * the provided signature in the request headers with the expected secret.
   * Throws an error if the verification fails.
   */
  private static async ensureAuthenticity({
    request,
    secret,
    data,
  }: {
    request: Request;
    secret: string;
    data: string;
  }): Promise<void> {
    const reqSignature = request.headers.get("x-secret");
    if (
      !reqSignature ||
      !(await verifySignature({
        data,
        signatureHex: reqSignature,
        secretKey: secret,
      }))
    ) {
      throw new WebHookUnAuthorizedError("Unauthorized webhook request");
    }
  }

  private static ensureTimeStamp(payload: WebHookPayLoad<any, {}>) {
    const payloadTime = new Date(payload.timestamp).getTime();
    const now = Date.now();
    const diff = Math.abs(now - payloadTime);
    // Allow a maximum of 5 minutes difference to prevent replay attacks
    if (diff > 5 * 60 * 1000) {
      throw new WebHookUnAuthorizedError(
        "Webhook request timestamp is too old",
      );
    }
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
