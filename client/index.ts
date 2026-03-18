import { createClient as _createClient } from "@kagii/openauth/client";
import { COOKIE_NAME } from "..";
import { createCookieContent } from "../utils";

const fetcher = (clientID: string) => {
	return async (input: RequestInfo, init?: RequestInit) => {
		const headers = new Headers(init?.headers || {});

		const url = new URL(input.toString());
		url.searchParams.set("client_id", clientID);

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
}: {
	clientID: string;
	issuer: string;
}) =>
	_createClient({
		clientID,
		issuer,
		fetch: fetcher(clientID),
	});

export function createServerClient({
	clientID,
	issuer,
	request,
}: {
	clientID: string;
	issuer: string;
	request: Request;
}) {
	const url = new URL(request.url);
	const client_id = url.searchParams.get("client_id") || clientID;

	return _createClient({
		clientID,
		issuer,
		fetch: fetcher(client_id),
	});
}
