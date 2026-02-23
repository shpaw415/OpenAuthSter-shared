import { DEFAULT_COPY, type QRProviderConfig } from ".";
import CSS from "./index.css" assert { type: "text" };
import { QRCodeSVG } from "qrcode.react";

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

const QrUIBody: QRProviderConfig["UI"] = ({ wsUrl, qrUrl, copy }) => {
  const mergedCopy = {
    ...DEFAULT_COPY,
    ...copy,
  };

  return (
    <>
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
          <QRCodeSVG value={qrUrl} size={250} className="qr-canvas" level="H" />
        </div>
      </div>
    </>
  );
};

export function QrUI(opt: QrUIConfig): QRProviderConfig {
  return {
    UI: QrUIBody,
    ...opt,
  };
}
