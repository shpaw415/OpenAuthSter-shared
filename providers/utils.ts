import { createClient } from "@openauthjs/openauth/client";
import type { Hono } from "hono";

export function createSelfClient({
  ctx,
  clientID,
  issuerURI,
  issuer,
  env,
}: {
  ctx: ExecutionContext;
  clientID: string;
  issuerURI?: string;
  issuer: Hono;
  env: Env;
}) {
  return createClient({
    clientID,
    issuer: issuerURI,
    async fetch(input, init) {
      const url = new URL(input);
      url.searchParams.append("client_id", clientID);
      return issuer.fetch(new Request(url.toString(), init), env, ctx);
    },
  });
}
