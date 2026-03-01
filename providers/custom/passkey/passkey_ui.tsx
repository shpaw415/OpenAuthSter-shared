import { Fragment } from "hono/jsx";
import CSS from "./style.css" assert { type: "text" };
//@ts-ignore
import { PASSKEY_DEFAULT_COPY } from "./";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

function PasskeyUI({
  callbackUrl,
  options,
}: {
  callbackUrl: string;
  options: PublicKeyCredentialRequestOptionsJSON;
  copy: Partial<typeof PASSKEY_DEFAULT_COPY>;
}) {
  return (
    <Fragment>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="passkey-container">
        {/* UI très simple : Un spinner de chargement */}
        <div className="passkey-spinner"></div>

        <h2 className="passkey-title">Authentification requise</h2>
        <p className="passkey-description">
          Veuillez utiliser votre FaceID, TouchID ou clé de sécurité pour vous
          connecter.
        </p>

        {/* Formulaire caché : c'est lui qui va envoyer le POST vers ton OpenAuth callback */}
        <form id="webauthn-form" method="post" action={callbackUrl}>
          <input type="hidden" name="assertion" id="assertion-input" />
        </form>

        {/* Zone d'erreur cachée par défaut */}
        <div id="error-message" className="passkey-error hidden"></div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `globalThis.__options__ = ${JSON.stringify({ options })};`,
        }}
      />

      <script src="/passkey/client.js"></script>
    </Fragment>
  );
}

export function PassKeyUI(data: {
  copy?: Partial<typeof PASSKEY_DEFAULT_COPY>;
}) {
  return (props: {
    callbackUrl: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }) =>
    PasskeyUI({ ...props, copy: { ...PASSKEY_DEFAULT_COPY, ...data.copy } });
}
