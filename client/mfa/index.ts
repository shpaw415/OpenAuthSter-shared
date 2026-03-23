import type { ErrorList } from "../errors";
import { TOTPClient } from "./totp";

export * from "./totp";

export class MFAmanager {
	public totpClient: TOTPClient;
	constructor({
		issuerURI,
		fetch,
		onError,
	}: {
		issuerURI: string;
		fetch: typeof globalThis.fetch;
		onError: (error: ErrorList) => void;
	}) {
		this.totpClient = new TOTPClient(issuerURI, fetch, onError);
	}
}
