import { createClient as _createClient } from "@openauthjs/openauth/client";
import { COOKIE_NAME, COOKIE_COPY_TEMPLATE_ID } from "..";
import { createCookieContent } from "../utils";

const fetcher = (clientID: string, copyID: string | null) => {
  return async (input: RequestInfo, init?: RequestInit) => {
    const headers = new Headers(init?.headers || {});

    headers.append(
      "Cookie",
      createCookieContent(COOKIE_NAME, clientID, { path: "/" }),
    );
    if (copyID) {
      headers.append(
        "Cookie",
        createCookieContent(COOKIE_COPY_TEMPLATE_ID, copyID, { path: "/" }),
      );
    }

    return await fetch(input, { ...init, headers, credentials: "include" });
  };
};

export const createClient = ({
  clientID,
  issuer,
  copyID,
}: {
  clientID: string;
  issuer: string;
  copyID: string | null;
}) =>
  _createClient({
    clientID,
    issuer,
    fetch: fetcher(clientID, copyID),
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
  const copy_id = url.searchParams.get("copy_id") || null;

  return _createClient({
    clientID,
    issuer,
    fetch: fetcher(client_id, copy_id),
  });
}
