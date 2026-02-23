import type { Provider } from "@openauthjs/openauth/provider/provider";
import { DurableObject } from "cloudflare:workers";
import type { JSXNode } from "hono/jsx";
import { jsxRenderer } from "hono/jsx-renderer";

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
  baseUrl: string;

  copy?: Partial<typeof DEFAULT_COPY>;

  UI: (props: {
    copy?: Partial<typeof DEFAULT_COPY>;
    qrUrl: string;
    wsUrl: string;
  }) => JSXNode;
}

/**
 * Provider OpenAuth pour l'authentification par QR Code.
 * Ce provider permet à un PC d'afficher un QR Code et d'attendre qu'un mobile
 * valide la session via un Durable Object.
 */
export function QRProvider(config: QRProviderConfig): Provider {
  return {
    type: "qr",
    init(route, options) {
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
        const qrUrl = `${config.baseUrl}/qr/validate?id=${handshakeId}`;
        const wsUrl = `${config.baseUrl.replace(/^http/, "ws")}/qr/ws?id=${handshakeId}`;

        return c.render(config.UI({ copy: config.copy, qrUrl, wsUrl }) as any);
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

        // Récupère les propriétés de l'utilisateur identifié (ex: { email: "user@example.com" })
        // En production, ces propriétés doivent provenir du token/session du mobile, pas du body non vérifié.
        const properties = await c.req.json();

        const id = config.binding.idFromName(handshakeId);
        const stub = config.binding.get(id);

        // Récupère l'état d'autorisation initial du PC depuis le DO
        const authData = await stub.getAuthData();
        if (!authData) {
          return c.text("Handshake expiré ou invalide", 400);
        }

        // Injecte l'état d'autorisation dans le contexte actuel pour que OpenAuth puisse le lire
        // C'est crucial car le mobile n'a pas le cookie d'autorisation du PC.
        //@ts-ignore
        c.set("authorization", authData);

        // Génère manuellement l'Authorization Code OAuth2 (standard OpenAuth) pour cet utilisateur
        // options.success va générer le code et renvoyer une réponse de redirection (302)
        const response = await options.success(c, properties);

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

/**
 * 2. Le Durable Object QRHandshake
 * Gère la connexion WebSocket du PC et l'état du handshake.
 */
export class QRHandshake extends DurableObject {
  private authData: any = null;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    // Restaure l'état depuis le stockage persistant si le DO a été redémarré
    this.ctx.blockConcurrencyWhile(async () => {
      this.authData = await this.ctx.storage.get("authData");
    });
  }

  /**
   * Initialise le handshake avec les données d'autorisation du PC.
   */
  async init(authData: any) {
    this.authData = authData;
    await this.ctx.storage.put("authData", this.authData);

    // Gestion de la sécurité : expiration du handshake après 5 minutes
    this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000);
  }

  /**
   * Récupère les données d'autorisation pour le mobile.
   */
  async getAuthData() {
    return this.authData as unknown;
  }

  /**
   * Méthode appelée par l'issuer pour pousser le code d'autorisation (via l'URL de redirection)
   * vers le PC via la WebSocket.
   */
  async authorize(location: string) {
    const websockets = this.ctx.getWebSockets();
    for (const ws of websockets) {
      try {
        ws.send(JSON.stringify({ location }));
      } catch (e) {
        // Ignore les erreurs d'envoi
      }
    }
  }

  /**
   * Gère les requêtes HTTP entrantes (principalement l'upgrade WebSocket).
   */
  //@ts-ignore
  async fetch(request: Request): Promise<Response> {
    // Gère la connexion WebSocket du PC
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      // Accepte la connexion WebSocket côté serveur
      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Appelé lorsque l'alarme se déclenche (après 5 minutes).
   */
  //@ts-ignore
  async alarm() {
    // Le handshake a expiré, on ferme les WebSockets et on nettoie le stockage
    const websockets = this.ctx.getWebSockets();
    for (const ws of websockets) {
      try {
        ws.send(JSON.stringify({ error: "Le QR Code a expiré." }));
        ws.close(1000, "Handshake expiré");
      } catch (e) {}
    }
    this.authData = null;
    await this.ctx.storage.deleteAll();
  }
}
