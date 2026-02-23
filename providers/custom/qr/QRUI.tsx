import { DEFAULT_COPY, type QRProviderConfig } from ".";
import CSS from "./index.css" assert { type: "text" };
import { encode } from "uqr";

type QrUIConfig = Omit<QRProviderConfig, "UI">;

export function renderQrCode(data: string) {
  const { data: matrix } = encode(data);
  return matrix; // Retourne un tableau de tableaux (boolean[][])
}

const InsertedScript = ({ wsUrl }: { wsUrl: string }) => `
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

  const qrMatrix = renderQrCode(qrUrl);
  const size = qrMatrix.length;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script dangerouslySetInnerHTML={{ __html: InsertedScript({ wsUrl }) }} />
      <div className="qr-container">
        <div className="qr-header">
          <h1 className="qr-title">{mergedCopy.title}</h1>
          <p className="qr-description">{mergedCopy.description}</p>
        </div>

        <div className="qr-canvas-wrapper">
          <svg viewBox={`0 0 ${size} ${size}`} className="qr-canvas">
            {qrMatrix.map((row, y) =>
              row.map((active, x) =>
                active ? (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width="1.1"
                    height="1.1"
                    className="qr-pixel"
                  />
                ) : null,
              ),
            )}
          </svg>
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
