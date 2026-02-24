import type { Provider } from "@openauthjs/openauth/provider/provider";
import { jsxRenderer } from "hono/jsx-renderer";
import { type JSX } from "hono/jsx/jsx-runtime";
import type { QRHandshake } from "../DurableObject";
import { Layout } from "@openauthjs/openauth/ui/base";
import { createSelfClient } from "../../utils";
import type { Hono } from "hono";
import type { SubjectSchema } from "@openauthjs/openauth/subject";

export const DEFAULT_COPY = {
  title: "Connexion par QR Code",
  description:
    "Scannez ce QR Code avec votre application mobile pour vous connecter.",
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
  /**
   * Application URI (ex: https://app.example.com) used to generate the QR code start the authentication flow.
   * This URI should point to a route in your application that can handle the validation logic and interact with OpenAuth.
   *
   * **Openauthster** already provides a verification when `client.init` is triggerd in your application.
   */
  appURI: string;

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

/**
 * Provider OpenAuth pour l'authentification par QR Code.
 * Ce provider permet à un PC d'afficher un QR Code et d'attendre qu'un mobile
 * valide la session via un Durable Object.
 */
export function QRProvider(
  config: QRProviderConfig,
): Provider<{ clientID: string; identifier: string }> {
  return {
    type: "qr",
    init(route, options) {
      route.get(
        "/authorize",
        jsxRenderer(({ children }) => Layout({ children })),
      );

      // 1. Le Handler authorize (Côté PC)
      route.get("/authorize", async (c) => {
        // Génère un handshakeId unique (UUID)
        const handshakeId = crypto.randomUUID();

        // Récupère l'état d'autorisation (client_id, redirect_uri, state, etc.)
        // stocké par OpenAuth dans le cookie du PC.
        const authData = await options.get(c, "authorization");
        if (!authData) {
          return c.text("Session d'autorisation introuvable ou expirée", 400);
        }

        // Initialise le Durable Object lié à cet ID
        const id = config.binding.idFromName(handshakeId);
        const stub = config.binding.get(id);

        // Stocke l'état d'autorisation dans le DO pour que le mobile puisse le récupérer
        await stub.init(authData);

        // Renvoie une page HTML/UI qui affiche le QR Code et ouvre la WebSocket
        const qrURL = new URL(config.appURI);
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

      // Gestion de la connexion WebSocket (Côté PC)
      route.get("/ws", async (c) => {
        const handshakeId = c.req.query("id");
        if (!handshakeId) return c.text("ID manquant", 400);

        const id = config.binding.idFromName(handshakeId);
        const stub = config.binding.get(id);

        // Transfère la requête d'upgrade WebSocket au Durable Object
        return stub.fetch(c.req.raw);
      });

      // 3. L'Endpoint validate (Côté Mobile)
      // Cet endpoint doit être protégé par l'authentification OpenAuth (le mobile doit être logué).
      // Dans cet exemple, on suppose que le mobile envoie les informations de l'utilisateur (properties) dans le body.
      route.post("/validate", async (c) => {
        const handshakeId = c.req.query("id");
        if (!handshakeId) return c.text("ID manquant", 400);

        const authorizationHeader = c.req.header("Authorization");
        if (!authorizationHeader) {
          return c.text("Authorization header manquant", 401);
        }
        console.log("Authorization header received:", authorizationHeader);

        const token = authorizationHeader.replace("Bearer ", "").trim();
        if (!token) {
          return c.text("Token manquant", 401);
        }
        console.log("Token extracted:", token);

        const subject = await createSelfClient({
          ctx: c.executionCtx,
          clientID: config.client_id,
          issuerURI: config.issuerURI,
          issuer: config.issuer,
          env: c.env as Env,
        }).verify(config.subject, token);

        if (subject.err) {
          console.error("Erreur de vérification du token:", subject.err);
          return c.text("Token invalide", 401);
        }

        console.log("Authorization with subject:", subject);

        const id = config.binding.idFromName(handshakeId);
        const stub = config.binding.get(id);

        // Récupère l'état d'autorisation initial du PC depuis le DO
        const authData = await stub.getAuthData();
        if (!authData) {
          return c.text("Handshake expiré ou invalide", 400);
        }

        console.log("Auth data retrieved from DO:", { authData });

        // Injecte l'état d'autorisation dans le contexte actuel pour que OpenAuth puisse le lire
        // C'est crucial car le mobile n'a pas le cookie d'autorisation du PC.
        //@ts-ignore
        c.set("authorization", authData);

        // Génère manuellement l'Authorization Code OAuth2 (standard OpenAuth) pour cet utilisateur
        // options.success va générer le code et renvoyer une réponse de redirection (302)
        const response = await options.success(c, {
          clientID: config.client_id,
          identifier: (subject.subject.properties as { identifier: string })!
            .identifier,
        });

        if (response.status !== 302) {
          return c.text(
            "Erreur lors de la génération du code d'autorisation",
            500,
          );
        }

        // Extrait l'URL de redirection qui contient le code et le state
        const location = response.headers.get("Location");
        if (!location) {
          return c.text("En-tête Location manquant", 500);
        }

        // Appelle la méthode authorize du Durable Object pour pousser l'URL (avec le code) vers le PC
        await stub.authorize(location);

        return c.json({ success: true });
      });
    },
  };
}

export { QrUI } from "./QRUI";
