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

function buildClientIDWithParams({
  clientID,
  copyID,
}: {
  clientID: string;
  copyID: string | null;
}) {
  return `${clientID}${copyID ? `::${copyID}` : ""}`;
}
