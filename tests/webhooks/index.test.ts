import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import type { WebHookEvents } from "../../webhook/types";

// ── DB mock (must be set up before WebHook is imported) ───────────────────────

let mockDbReturnValue: any;

mock.module("../../database/drizzle", () => ({
  drizzle: () => buildChain(),
  eq: (_col: any, _val: any) => ({}),
  and: (..._args: any[]) => ({}),
}));

function buildChain(): any {
  const chain: any = {
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    select: () => chain,
    values: () => chain,
    set: () => chain,
    where: () => chain,
    from: () => chain,
    // .all() is awaited directly (trigger) or chained with .then() (getWebHooks)
    all: () => Promise.resolve(mockDbReturnValue),
    // .returning().then(callback) pattern (register / update)
    returning: () => ({
      then: (fn: (v: any) => any) => Promise.resolve(fn(mockDbReturnValue)),
    }),
    // .run() is awaited directly (deleteWebHook)
    run: () => Promise.resolve(),
  };
  return chain;
}

import { WebHook, WebHookUnAuthorizedError } from "../../webhook/index";
import { hashWithSecretKey } from "../../security/encryption";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLIENT_ID = "client_abc";
const SECRET = "super-secret-key";

const RAW_WEBHOOK = {
  id: "wh-001",
  clientID: CLIENT_ID,
  event: "login_success" as WebHookEvents,
  url: "https://example.com/webhook",
  method: "POST",
  headers: JSON.stringify({ "x-api-key": "token" }),
  created_at: "2026-02-22T00:00:00.000Z",
};

const RAW_WEBHOOK_NO_HEADERS = {
  ...RAW_WEBHOOK,
  id: "wh-002",
  headers: null,
};

function makeWebHook() {
  return new WebHook({ db: {} as D1Database });
}

// ── parseWebHookConfig ────────────────────────────────────────────────────────

describe("parseWebHookConfig", () => {
  const wh = makeWebHook();

  it("parses headers JSON string into an object", () => {
    const result = wh.parseWebHookConfig(RAW_WEBHOOK as any);
    expect(result.headers).toEqual({ "x-api-key": "token" });
  });

  it("returns undefined headers when null", () => {
    const result = wh.parseWebHookConfig(RAW_WEBHOOK_NO_HEADERS as any);
    expect(result.headers).toBeUndefined();
  });

  it("maps all fields correctly", () => {
    const result = wh.parseWebHookConfig(RAW_WEBHOOK as any);
    expect(result).toMatchObject({
      id: "wh-001",
      clientID: CLIENT_ID,
      event: "login_success",
      url: "https://example.com/webhook",
      method: "POST",
      created_at: "2026-02-22T00:00:00.000Z",
    });
  });
});

// ── stringifyWebHookConfig ────────────────────────────────────────────────────

describe("stringifyWebHookConfig", () => {
  const wh = makeWebHook();

  it("serialises headers object to JSON string", () => {
    const result = wh.stringifyWebHookConfig({
      url: "https://example.com",
      method: "POST",
      headers: { Authorization: "Bearer tok" },
      event: "login_success",
    });
    expect(result.headers).toBe(
      JSON.stringify({ Authorization: "Bearer tok" }),
    );
  });

  it("leaves headers as undefined when not provided", () => {
    const result = wh.stringifyWebHookConfig({
      url: "https://example.com",
      method: "GET",
      event: "registration_success",
    });
    expect(result.headers).toBeUndefined();
  });
});

// ── register ──────────────────────────────────────────────────────────────────

describe("register", () => {
  it("returns a parsed ExtendedWebHookConfig from the inserted row", async () => {
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    const result = await wh.register({
      event: "login_success",
      clientID: CLIENT_ID,
      config: {
        url: RAW_WEBHOOK.url,
        method: "POST",
        event: "login_success",
      },
    });

    expect(result.id).toBe("wh-001");
    expect(result.clientID).toBe(CLIENT_ID);
    expect(result.event).toBe("login_success");
    expect(result.headers).toEqual({ "x-api-key": "token" });
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe("update", () => {
  it("returns the updated parsed config", async () => {
    const updated = { ...RAW_WEBHOOK, url: "https://new.example.com" };
    mockDbReturnValue = [updated];
    const wh = makeWebHook();

    const result = await wh.update({
      webHookID: "wh-001",
      config: {
        url: "https://new.example.com",
        method: "POST",
        event: "login_success",
      },
    });

    expect(result.url).toBe("https://new.example.com");
  });
});

// ── getWebHooks ───────────────────────────────────────────────────────────────

describe("getWebHooks", () => {
  it("returns all webhooks for a clientID (no filters)", async () => {
    mockDbReturnValue = [RAW_WEBHOOK, RAW_WEBHOOK_NO_HEADERS];
    const wh = makeWebHook();

    const results = await wh.getWebHooks(CLIENT_ID);

    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe("wh-001");
  });

  it("returns webhooks filtered by event", async () => {
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    const results = await wh.getWebHooks(CLIENT_ID, { event: "login_success" });

    expect(results).toHaveLength(1);
    expect(results[0]!.event).toBe("login_success");
  });

  it("returns a webhook filtered by id", async () => {
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    const results = await wh.getWebHooks(CLIENT_ID, { id: "wh-001" });

    expect(results[0]!.id).toBe("wh-001");
  });

  it("parses headers for each returned row", async () => {
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    const results = await wh.getWebHooks(CLIENT_ID);

    expect(results[0]!.headers).toEqual({ "x-api-key": "token" });
  });
});

// ── deleteWebHook ─────────────────────────────────────────────────────────────

describe("deleteWebHook", () => {
  it("resolves without throwing", async () => {
    const wh = makeWebHook();
    await expect(wh.deleteWebHook("wh-001")).resolves.toBeUndefined();
  });
});

// ── trigger ───────────────────────────────────────────────────────────────────

describe("trigger", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }) as any,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("calls fetch once for each registered webhook", async () => {
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    await wh.trigger({
      clientID: CLIENT_ID,
      event: "login_success",
      secret: SECRET,
      data: { userID: "user-1", provider: "google" },
      request: new Request("https://example.com/login"),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends POST request with JSON body and x-secret header", async () => {
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    await wh.trigger({
      clientID: CLIENT_ID,
      event: "login_success",
      secret: SECRET,
      data: { claim: {} },
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("https://example.com/webhook");
    expect((init as RequestInit).method).toBe("POST");
    expect(
      (init as RequestInit).headers as Record<string, string>,
    ).toHaveProperty("x-secret");
    expect((init as RequestInit).body).toBeDefined();
  });

  it("sends GET request with payload search param when method is GET", async () => {
    mockDbReturnValue = [{ ...RAW_WEBHOOK, method: "GET", headers: null }];
    const wh = makeWebHook();

    await wh.trigger({
      clientID: CLIENT_ID,
      event: "login_success",
      secret: SECRET,
      data: { claim: {} },
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("payload=");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("returns success:true when fetch responds 200", async () => {
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    const results = await wh.trigger({
      clientID: CLIENT_ID,
      event: "login_success",
      secret: SECRET,
      data: {},
    });

    expect(results[0]).toMatchObject({ success: true, id: "wh-001" });
  });

  it("returns success:false when fetch responds with an error status", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
      }) as any,
    );
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    const results = await wh.trigger({
      clientID: CLIENT_ID,
      event: "login_success",
      secret: SECRET,
      data: {},
    });

    expect(results[0]).toMatchObject({ success: false, id: "wh-001" });
  });

  it("returns success:false when fetch throws", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    mockDbReturnValue = [RAW_WEBHOOK];
    const wh = makeWebHook();

    const results = await wh.trigger({
      clientID: CLIENT_ID,
      event: "login_success",
      secret: SECRET,
      data: {},
    });

    expect(results[0]).toMatchObject({ success: false, id: "wh-001" });
  });

  it("does not call fetch when no webhooks are registered", async () => {
    mockDbReturnValue = [];
    const wh = makeWebHook();

    const results = await wh.trigger({
      clientID: CLIENT_ID,
      event: "login_success",
      secret: SECRET,
      data: {},
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });
});

// ── getWebHookPayloadFromRequest ──────────────────────────────────────────────

describe("WebHook.getWebHookPayloadFromRequest", () => {
  async function makeSignedPostRequest(
    payload: object,
    secret: string,
    badSignature = false,
  ) {
    const body = JSON.stringify(payload);
    const signature = badSignature
      ? "badhex"
      : await hashWithSecretKey(body, secret);
    return new Request("https://example.com/hook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret": signature,
      },
      body,
    });
  }

  async function makeSignedGetRequest(
    payload: object,
    secret: string,
    badSignature = false,
  ) {
    const body = JSON.stringify(payload);
    const signature = badSignature
      ? "badhex"
      : await hashWithSecretKey(body, secret);
    const url = new URL("https://example.com/hook");
    url.searchParams.set("payload", body);
    return new Request(url.toString(), {
      method: "GET",
      headers: { "x-secret": signature },
    });
  }

  // Use a fresh timestamp so the 5-minute replay-protection check always passes
  const makeSamplePayload = () => ({
    id: "wh-001",
    clientID: CLIENT_ID,
    event: "login_success" as WebHookEvents,
    timestamp: new Date().toISOString(),
    data: { claim: { sub: "user-1" } },
  });

  it("parses a valid POST request and returns the payload", async () => {
    const req = await makeSignedPostRequest(makeSamplePayload(), SECRET);
    const result = await WebHook.getWebHookPayloadFromRequest(
      "login_success",
      req,
      SECRET,
    );
    expect(result.event).toBe("login_success");
    expect(result.clientID).toBe(CLIENT_ID);
    expect(result.data).toEqual({ claim: { sub: "user-1" } });
  });

  it("parses a valid GET request and returns the payload", async () => {
    const req = await makeSignedGetRequest(makeSamplePayload(), SECRET);
    const result = await WebHook.getWebHookPayloadFromRequest(
      "login_success",
      req,
      SECRET,
    );
    expect(result.event).toBe("login_success");
  });

  it("throws when POST request has invalid signature", async () => {
    const req = await makeSignedPostRequest(makeSamplePayload(), SECRET, true);
    await expect(
      WebHook.getWebHookPayloadFromRequest("login_success", req, SECRET),
    ).rejects.toThrow("Unauthorized webhook request");
  });

  it("throws when GET request has invalid signature", async () => {
    const req = await makeSignedGetRequest(makeSamplePayload(), SECRET, true);
    await expect(
      WebHook.getWebHookPayloadFromRequest("login_success", req, SECRET),
    ).rejects.toThrow("Unauthorized webhook request");
  });

  it("throws when GET request is missing payload param", async () => {
    const req = new Request("https://example.com/hook", {
      method: "GET",
      headers: { "x-secret": "anything" },
    });
    await expect(
      WebHook.getWebHookPayloadFromRequest("login_success", req, SECRET),
    ).rejects.toThrow("Missing payload in webhook request");
  });

  it("throws when x-secret header is missing", async () => {
    const body = JSON.stringify(makeSamplePayload());
    const req = new Request("https://example.com/hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    await expect(
      WebHook.getWebHookPayloadFromRequest("login_success", req, SECRET),
    ).rejects.toThrow("Unauthorized webhook request");
  });

  // ── timestamp verification ──────────────────────────────────────────────

  it("throws when timestamp is older than 5 minutes (replay attack)", async () => {
    const stalePayload = {
      ...makeSamplePayload(),
      timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    };
    const req = await makeSignedPostRequest(stalePayload, SECRET);
    expect(
      WebHook.getWebHookPayloadFromRequest("login_success", req, SECRET),
    ).rejects.toThrow(WebHookUnAuthorizedError);
  });

  it("throws when timestamp is more than 5 minutes in the future", async () => {
    const futurePayload = {
      ...makeSamplePayload(),
      timestamp: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
    };
    const req = await makeSignedPostRequest(futurePayload, SECRET);
    expect(
      WebHook.getWebHookPayloadFromRequest("login_success", req, SECRET),
    ).rejects.toThrow(WebHookUnAuthorizedError);
  });

  it("accepts a timestamp within the 5-minute window", async () => {
    const recentPayload = {
      ...makeSamplePayload(),
      timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    };
    const req = await makeSignedPostRequest(recentPayload, SECRET);
    await expect(
      WebHook.getWebHookPayloadFromRequest("login_success", req, SECRET),
    ).resolves.toMatchObject({ event: "login_success" });
  });
});

// ── WebHook.create ────────────────────────────────────────────────────────────
// Note: WebHook.create() uses TypeScript's Omit<> for compile-time restrictions
// only. At runtime all methods are accessible on the underlying WebHook instance.

describe("WebHook.create", () => {
  it("returns a WebHook instance", () => {
    const wh = WebHook.create({ db: {} as D1Database });
    expect(wh).toBeInstanceOf(WebHook);
  });

  it("exposes getWebHookPayloadFromRequest as a static method", () => {
    expect(typeof WebHook.getWebHookPayloadFromRequest).toBe("function");
  });
});
