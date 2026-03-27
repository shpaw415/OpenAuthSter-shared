import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import type { OpenAuthsterClient } from "./user";

type PasskeyClientAdapter = Pick<
	OpenAuthsterClient,
	"fetchWithOptions" | "login"
>;

export type PasskeyRegistrationOptions = {
	userDisplayName?: string;
	flow?: "app";
};

export class Passkey {
	constructor(
		private issuerURI: string,
		private client: PasskeyClientAdapter,
	) {}

	async register(options?: PasskeyRegistrationOptions) {
		return this.registerPasskeyAppFlow(options);
	}

	private async registerPasskeyAppFlow(
		options?: PasskeyRegistrationOptions,
	): Promise<{
		success: boolean;
		message?: string;
		error?: string;
	}> {
		const { userDisplayName } = options || {};

		try {
			// Étape 1 : Demander le "challenge" et les options à ton Worker
			const startRes = await this.client.fetchWithOptions(
				`${this.issuerURI}/passkey/register/start`,
				{
					method: "POST",
					body: JSON.stringify({ userDisplayName }),
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
			let attestationResponse: Awaited<ReturnType<typeof startRegistration>>;
			try {
				attestationResponse = await startRegistration({
					optionsJSON: options,
				});
			} catch (domError: unknown) {
				// Gestion des erreurs UX très importante ici
				if (domError instanceof Error && domError.name === "NotAllowedError") {
					return {
						success: false,
						error: "Vous avez annulé la création du Passkey.",
					};
				}
				if (
					domError instanceof Error &&
					domError.name === "NotSupportedError"
				) {
					return {
						success: false,
						error: "Cet appareil ne supporte pas les Passkeys.",
					};
				}
				throw domError;
			}

			// Étape 3 : Envoyer la signature cryptographique au serveur pour validation finale
			const finishRes = await this.client.fetchWithOptions(
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
		} catch (error: unknown) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Une erreur inattendue est survenue.",
			};
		}
	}
	/**
	 * Trigger the Passkey login flow. This will redirect the user to the OS-level authentication prompt.
	 */
	login() {
		return this.client.login({
			provider: "passkey",
		});
	}
	async flowCallback() {
		const challengeData = (await this.createFetch("/generate_challenge", {
			credentials: "include",
		}).then(async (r) => {
			if (!r.ok) throw new Error(await r.text());
			return await r.json();
		})) as {
			challenge: { id: string; challenge: string; expires_at: string };
			options: PublicKeyCredentialRequestOptionsJSON;
		};

		const res = await startAuthentication({
			optionsJSON: challengeData.options,
		});
		const verifyRes = await this.createFetch(
			`/authorize/token/${challengeData.challenge.id}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(res),
			},
		);
		if (!verifyRes.ok) {
			const errorText = await verifyRes.text();
			throw new Error(errorText || "Authentication failed");
		}

		const token_access = (await verifyRes.json()) as {
			token: string;
			expires_at: string;
		};

		window.location.href = `${this.issuerURI}/passkey/callback/${token_access.token}`;
	}

	private createFetch(endpoint: string, options?: RequestInit) {
		const url = new URL(`${this.issuerURI}/passkey${endpoint}`);
		return this.client.fetchWithOptions(url.toString(), options);
	}
}
