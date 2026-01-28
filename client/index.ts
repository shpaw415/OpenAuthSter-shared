import { createClient as _createClient } from "@openauthjs/openauth/client";
import { COOKIE_NAME } from "..";

export type OpenAuthOptions = {
  copyId: string | null;
};
declare global {
  var OpenAuthOptions: OpenAuthOptions;
}

globalThis.OpenAuthOptions ??= {
  copyId: null,
};

export const createClient = ({
  clientID,
  issuer,
}: {
  clientID: string;
  issuer: string;
}) =>
  _createClient({
    clientID: buildClientIDWithParams({ clientID }),
    issuer,
    fetch(input: RequestInfo, init?: RequestInit) {
      const header = new Headers(init?.headers);
      header.append("Cookie", `${COOKIE_NAME}=${clientID}`);
      return fetch(input, {
        ...init,
        headers: header,
      });
    },
  });

function buildClientIDWithParams({ clientID }: { clientID: string }) {
  const copyId = globalThis.OpenAuthOptions.copyId;
  return `${clientID}${copyId ? `::${copyId}` : ""}`;
}

export function setOpenAuthOptions(options: Partial<OpenAuthOptions>) {
  globalThis.OpenAuthOptions = {
    ...globalThis.OpenAuthOptions,
    ...options,
  };
}
