import { DurableObject } from "cloudflare:workers";

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
