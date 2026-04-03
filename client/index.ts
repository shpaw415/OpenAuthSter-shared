import { createClient as _createClient } from "@kagii/openauth/client";
import { COOKIE_NAME } from "..";
import { createCookieContent } from "../utils";

type ClientFactoryOptions = {
	clientID: string;
	issuer: string;
	copyID?: string | null;
};

const fetcher = ({
	clientID,
	copyID,
}: {
	clientID: string;
	copyID?: string | null;
}) => {
	return async (input: RequestInfo, init?: RequestInit) => {
		const headers = new Headers(init?.headers || {});

		const url = new URL(input.toString());
		url.searchParams.set("client_id", clientID);
		if (copyID) {
			url.searchParams.set("copy_id", copyID);
		}

		headers.append(
			"Cookie",
			createCookieContent(COOKIE_NAME, clientID, { path: "/" }),
		);

		return await fetch(url.toString(), {
			...init,
			headers,
			credentials: "include",
		});
	};
};

export const createClient = ({
	clientID,
	issuer,
	copyID,
}: ClientFactoryOptions) =>
	_createClient({
		clientID,
		issuer,
		fetch: fetcher({ clientID, copyID }),
	});

export function createServerClient({
	clientID,
	issuer,
	request,
	copyID,
}: ClientFactoryOptions & {
	request: Request;
}) {
	const url = new URL(request.url);
	const resolvedClientID = url.searchParams.get("client_id") || clientID;
	const resolvedCopyID = url.searchParams.get("copy_id") ?? copyID ?? null;

	return _createClient({
		clientID: resolvedClientID,
		issuer,
		fetch: fetcher({ clientID: resolvedClientID, copyID: resolvedCopyID }),
	});
}
