import type { Provider } from "@openauthjs/openauth/provider/provider";
import { jsxRenderer } from "hono/jsx-renderer";
import { type JSX } from "hono/jsx/jsx-runtime";
import type { QRHandshake } from "../DurableObject";
import { Layout } from "@openauthjs/openauth/ui/base";
import type { Hono } from "hono";
import type { SubjectSchema } from "@openauthjs/openauth/subject";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import type { ProviderType } from "openauth-webui-shared-types";
import * as v from "valibot";
import type { AuthorizationState } from "@openauthjs/openauth/issuer";

export const DEFAULT_COPY = {
  title: "Sign in with QR Code",
  description: "Scan this QR Code with your mobile app to sign in.",
};

export interface QRProviderConfig {
  /**
   * Le namespace du Durable Object QRHandshake
   */
  binding: DurableObjectNamespace<QRHandshake>;
  /**
   * L'URL de base de l'issuer (ex: https://auth.example.com)
   */
  issuerURI: string;

  copy?: Partial<typeof DEFAULT_COPY>;

  client_id: string;

  issuer: Hono;
  subject: SubjectSchema;

  UI: (props: {
    copy?: Partial<typeof DEFAULT_COPY>;
    qrUrl: string;
    wsUrl: string;
  }) => JSX.Element;
}

export type QRProviderOnSuccessData<Provider extends ProviderType = "qr"> = {
  id: string;
  identifier: string;
  data: Record<string, unknown>;
  clientID: string;
  provider: Provider;
};

/**
 * Provider OpenAuth pour l'authentification par QR Code.
 * Ce provider permet à un PC d'afficher un QR Code et d'attendre qu'un mobile
 * valide la session via un Durable Object.
 */
export function QRProvider(
  config: QRProviderConfig,
): Provider<QRProviderOnSuccessData<"qr">> {
  let cachedJWKS: ReturnType<typeof createLocalJWKSet> | null = null;
  let cachedJWKSAt: number | null = null;

  async function getJWKS(issuer: Hono, env: Env, ctx: ExecutionContext) {
    if (
      cachedJWKS &&
      cachedJWKSAt &&
      Date.now() - cachedJWKSAt < 60 * 60 * 1000
    )
      return cachedJWKS;
    const wkRes = await issuer.fetch(
      new Request(
        `${config.issuerURI}/.well-known/oauth-authorization-server?client_id=${config.client_id}`,
      ),
      env,
      ctx,
    );
    const wk = (await wkRes.json()) as { jwks_uri: string };
    const keysRes = await issuer.fetch(
      new Request(`${wk.jwks_uri}?client_id=${config.client_id}`),
      env,
      ctx,
    );
    const keyset = (await keysRes.json()) as JSONWebKeySet;
    cachedJWKS = createLocalJWKSet(keyset);
    cachedJWKSAt = Date.now();
    return cachedJWKS;
  }

  return {
    type: "qr",
    init(route, options) {
      route.get(
        "/authorize",
        jsxRenderer(({ children }) => Layout({ children })),
      );

      // 1. Authorize handler (PC side)
      route.get("/authorize", async (c) => {
        // Generate a unique handshakeId (UUID)
        const handshakeId = crypto.randomUUID();

        // Retrieve the authorization state (client_id, redirect_uri, state, etc.)
        // stored by OpenAuth in the PC's cookie.
        const authData = await options.get<AuthorizationState | undefined>(
          c,
          "authorization",
        );
        if (!authData) {
          return c.text("Authorization session not found or expired", 400);
        }

        // Initialize the Durable Object for this handshake ID
        const id = config.binding.idFromName(handshakeId);
        const stub = config.binding.get(id);

        // Store the authorization state in the DO so the mobile can retrieve it
        await stub.init(authData);

        // Return an HTML/UI page that displays the QR Code and opens the WebSocket
        const qrURL = new URL(authData.redirect_uri);
        qrURL.searchParams.set("id", handshakeId);
        qrURL.searchParams.set("flow", "qr");

        const wsURL = new URL(`${config.issuerURI}/qr/ws`);
        wsURL.searchParams.set("id", handshakeId);
        wsURL.searchParams.set("client_id", config.client_id);
        wsURL.protocol = wsURL.protocol === "https:" ? "wss:" : "ws:";

        return c.render(
          config.UI({
            copy: config.copy,
            qrUrl: qrURL.toString(),
            wsUrl: wsURL.toString(),
          }),
        );
      });

      // WebSocket connection handler (PC side)
      route.get("/ws", async (c) => {
        const handshakeId = c.req.query("id");
        if (!handshakeId) return c.text("Missing ID", 400);

        const id = config.binding.idFromName(handshakeId);
        const stub = config.binding.get(id);

        // Forward WebSocket upgrade request to the Durable Object
        return stub.fetch(c.req.raw);
      });

      // 3. Validate endpoint (Mobile side)
      // This endpoint must be protected by OpenAuth authentication (the mobile user must be logged in).
      // The mobile sends the user information (properties) in the body.
      route.post("/validate", async (c) => {
        const handshakeId = c.req.query("id");
        if (!handshakeId) return c.text("Missing ID", 400);

        const authorizationHeader = c.req.header("Authorization");
        if (!authorizationHeader) {
          return c.text("Missing Authorization header", 401);
        }
        const token = authorizationHeader.replace("Bearer ", "").trim();
        if (!token) {
          return c.text("Missing token", 401);
        }

        const jwks = await getJWKS(config.issuer, c.env as Env, c.executionCtx);

        let subject: {
          type: string;
          properties: QRProviderOnSuccessData;
        };
        try {
          const result = await jwtVerify<{
            mode: "access";
            type: string;
            properties: Record<string, unknown>;
          }>(token, jwks, { issuer: config.issuerURI });

          if (result.payload.mode !== "access") {
            return c.text("Invalid token", 401);
          }

          const schema = config.subject[result.payload.type]!;
          if (!schema) {
            return c.text("Invalid token: unknown subject type", 401);
          }

          const validated = v.safeParse(schema, result.payload.properties);
          if (!validated.success) {
            return c.text("Invalid token: invalid subject properties", 401);
          }

          subject = {
            type: result.payload.type,
            properties: {
              ...(validated.output as QRProviderOnSuccessData<"qr">),
              provider: "qr",
            },
          };
        } catch (e) {
          console.error("Token verification error:", e);
          return c.text("Invalid token", 401);
        }

        const id = config.binding.idFromName(handshakeId);
        const stub = config.binding.get(id);

        // Retrieve the initial PC authorization state from the DO
        const authData = await stub.getAuthData();
        if (!authData) {
          return c.text("Handshake expired or invalid", 400);
        }

        // Inject the authorization state into the current context so OpenAuth can read it.
        // This is required because the mobile client does not have the PC's authorization cookie.
        //@ts-ignore
        c.set("authorization", authData);

        console.log(
          "Subject validated from mobile:",
          JSON.stringify({ subject }, null, 2),
        );
        console.log(
          "Auth data retrieved from DO:",
          JSON.stringify({ authData }, null, 2),
        );

        // Generate the OAuth2 Authorization Code for the user (standard OpenAuth approach).
        // options.success generates the code and returns a redirect response (302).
        const response = await options.success(c, subject.properties);

        if (response.status !== 302) {
          return c.text("Error generating authorization code", 500);
        }

        // Extract the redirect URL containing the code and state
        const location = response.headers.get("Location");
        if (!location) {
          return c.text("Missing Location header", 500);
        }

        // Call the Durable Object's authorize method to push the URL (with the code) to the PC
        await stub.authorize(location);

        return c.json({ success: true });
      });
    },
  };
}

export { QrUI } from "./QRUI";
