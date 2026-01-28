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

    return await fetch(input, { ...init, headers });
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
    clientID: buildClientIDWithParams({ clientID, copyID }),
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
  // [0]: clientID, [1]: copyID
  const clientIdWithParams = new URL(request.url).searchParams
    .get("client_id")
    ?.split("::") as [string, string | undefined] | null;

  return _createClient({
    clientID: buildClientIDWithParams({
      clientID,
      copyID: clientIdWithParams?.at(1) || null,
    }),
    issuer,
    fetch: fetcher(clientID, clientIdWithParams?.at(1) || null),
  });
}

function buildClientIDWithParams({
  clientID,
  copyID,
}: {
  clientID: string;
  copyID: string | null;
}) {
  return `${clientID}${copyID ? `::${copyID}` : ""}`;
}
