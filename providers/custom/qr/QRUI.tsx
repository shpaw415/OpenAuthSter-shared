import { Layout } from "@openauthjs/openauth/ui/base";
import { DEFAULT_COPY, type QRProviderConfig } from ".";
import CSS from "./index.css" assert { type: "text" };
import React from "react";
type QrUIConfig = Omit<QRProviderConfig, "UI">;

const InsertedScript = ({
  qrUrl,
  wsUrl,
}: {
  qrUrl: string;
  wsUrl: string;
}) => `// Affiche le QR Code contenant l'URL de validation
      QRCode.toCanvas(
        document.getElementById("qrcode"),
        "${qrUrl}",
        { width: 250 },
        function (error) {
          if (error) console.error(error);
        },
      );

      // Ouvre une WebSocket vers le Durable Object pour attendre le signal de succès
      const ws = new WebSocket("${wsUrl}");
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.location) {
          // 4. Finalisation (Côté PC)
          // Le script JS reçoit l'URL de redirection (qui contient le code et le state)
          // et redirige l'utilisateur vers la callback_url d'origine pour terminer le flux PKCE.
          window.location.href = data.location;
        } else if (data.error) {
          alert("Erreur: " + data.error);
        }
      };
      ws.onclose = () => {
        console.log("WebSocket fermée. Le handshake a peut-être expiré.");
      };`;

//@ts-ignore
const qrUI: QRProviderConfig["UI"] = ({ wsUrl, qrUrl, copy }) => {
  const mergedCopy = {
    ...DEFAULT_COPY,
    ...copy,
  };
  return (
    <Layout>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script
        dangerouslySetInnerHTML={{ __html: InsertedScript({ qrUrl, wsUrl }) }}
      />
      <div className="qr-container">
        <div className="qr-header">
          <h1 className="qr-title">{mergedCopy.title}</h1>
          <p className="qr-description">{mergedCopy.description}</p>
        </div>

        <div className="qr-canvas-wrapper">
          <canvas id="qrcode" className="qr-canvas" />
        </div>
      </div>
    </Layout>
  );
};

export function QrUI(opt: QrUIConfig): QRProviderConfig {
  return {
    UI: qrUI,
    ...opt,
  };
}
