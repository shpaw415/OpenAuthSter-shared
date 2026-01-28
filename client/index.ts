import { createClient as _createClient } from "@openauthjs/openauth/client";

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
      copyID: clientIdWithParams ? clientIdWithParams[1] || null : null,
    }),
    issuer,
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
