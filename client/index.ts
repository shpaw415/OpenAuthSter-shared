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
    clientID,
    issuer,
    fetch(input: RequestInfo, init?: RequestInit) {
      const header = new Headers(init?.headers);
      header.append("Cookie", `${COOKIE_NAME}=${clientID}`);
      globalThis.OpenAuthOptions.copyId &&
        header.append("X-OpenAuth-Copy-ID", globalThis.OpenAuthOptions.copyId);
      return fetch(input, {
        ...init,
        headers: header,
      });
    },
  });

export function setOpenAuthOptions(options: Partial<OpenAuthOptions>) {
  globalThis.OpenAuthOptions = {
    ...globalThis.OpenAuthOptions,
    ...options,
  };
}
