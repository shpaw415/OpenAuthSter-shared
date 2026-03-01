import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

export class Passkey {
  constructor(
    private fetch: typeof window.fetch,
    private issuerURI: string,
  ) {}

  async registerPasskey(): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      // Étape 1 : Demander le "challenge" et les options à ton Worker
      const startRes = await this.fetch(
        `${this.issuerURI}/passkey/register/start`,
        {
          method: "POST",
        },
      );

      const startData = (await startRes.json()) as {
        challengeId: string;
        options: PublicKeyCredentialCreationOptionsJSON;
        error?: string;
      };
      if (!startRes.ok || startData.error) {
        throw new Error(
          startData.error || "Impossible d'initialiser le Passkey.",
        );
      }

      const { challengeId, options } = startData;

      // Étape 2 : L'interaction avec l'OS du navigateur
      // C'est ici que la petite fenêtre système s'ouvre pour demander l'empreinte
      let attestationResponse;
      try {
        attestationResponse = await startRegistration({
          optionsJSON: options,
        });
      } catch (domError: any) {
        // Gestion des erreurs UX très importante ici
        if (domError.name === "NotAllowedError") {
          return {
            success: false,
            error: "Vous avez annulé la création du Passkey.",
          };
        } else if (domError.name === "NotSupportedError") {
          return {
            success: false,
            error: "Cet appareil ne supporte pas les Passkeys.",
          };
        }
        throw domError;
      }

      // Étape 3 : Envoyer la signature cryptographique au serveur pour validation finale
      const finishRes = await this.fetch(
        `${this.issuerURI}/passkey/register/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId,
            response: attestationResponse,
          }),
        },
      );

      const finishData = (await finishRes.json()) as {
        success: boolean;
        error?: string;
      };
      if (!finishRes.ok || finishData.error) {
        throw new Error(
          finishData.error || "La validation de la clé a échoué.",
        );
      }

      return { success: true, message: "Passkey enregistré avec succès !" };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Une erreur inattendue est survenue.",
      };
    }
  }
}
