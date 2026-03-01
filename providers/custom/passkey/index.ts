import type { Provider } from "@openauthjs/openauth/provider/provider";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  webauthnChallengesTable,
  webauthnCredentialsTable,
  OTFusersTable,
} from "../../../database/schema";
import { jsxRenderer } from "hono/jsx-renderer";
import { Layout } from "@openauthjs/openauth/ui/base";
import { PassKeyUI } from "./passkey_ui";
import ClientScript from "../../build/passkey/client.js" assert { type: "text" };

export const PASSKEY_DEFAULT_COPY = {
  title: "Sign in with Passkey",
};

export interface WebAuthnProviderConfig {
  db: D1Database;
  rpID: string;
  origin: string;
  UI: ReturnType<typeof PassKeyUI>;
}

// Helper for Base64URL to Uint8Array (Mock of Buffer.from(str, 'base64url'))
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function WebAuthnProvider(
  config: WebAuthnProviderConfig,
): Provider<{ id: string }> {
  const db = drizzle(config.db as D1Database);

  return {
    type: "passkey",
    init(routes, ctx) {
      routes.get(
        "/authorize",
        jsxRenderer(({ children }) => Layout({ children })),
      );

      routes.get("/authorize", async (c) => {
        const userID = c.req.query("user_id");
        const clientID = c.req.query("client_id");

        if (!userID || !clientID) {
          return c.text("User ID and client_id are required", 400);
        }

        const dbUserTable = OTFusersTable(clientID);

        // 1. Check if user exists
        let user;
        try {
          const result = await db
            .select()
            .from(dbUserTable)
            .where(eq(dbUserTable.id, userID))
            .limit(1);
          user = result[0];
        } catch (e) {
          console.error(e);
          return c.text("Error querying user", 500);
        }

        if (!user) {
          return c.text("User not found", 404);
        }

        // 2. Get credentials
        const userCredentials = await db
          .select()
          .from(webauthnCredentialsTable)
          .where(
            and(
              eq(webauthnCredentialsTable.user_id, user.id),
              eq(webauthnCredentialsTable.clientID, clientID),
            ),
          );

        if (userCredentials.length === 0) {
          return c.text("No passkeys registered for this user", 400);
        }

        // 3. Generate options
        const options = await generateAuthenticationOptions({
          rpID: config.rpID,
          allowCredentials: userCredentials.map((cred) => ({
            id: cred.credential_id,
            type: "public-key",
            transports: cred.transports
              ? (cred.transports as AuthenticatorTransportFuture[])
              : undefined,
          })),
        });

        // 4. Save challenge
        await db.insert(webauthnChallengesTable).values({
          id: crypto.randomUUID(),
          user_id: user.id,
          clientID: clientID,
          challenge: options.challenge,
          expires_at: new Date(Date.now() + 60000 * 5).toISOString(), // 5 mins
          created_at: new Date().toISOString(),
        });

        // 5. Return HTML
        return c.html(
          config.UI({
            callbackUrl: `/passkey/callback?user_id=${userID}&client_id=${clientID}`,
            options,
          }),
        );
      });

      routes.post("/callback", async (c) => {
        const payload = await c.req.json();
        const userID = c.req.query("user_id");
        const clientID = c.req.query("client_id");

        if (!userID || !clientID)
          return c.json({ error: "Missing user_id or client_id" }, 400);

        const dbUserTable = OTFusersTable(clientID);
        const user = await db
          .select()
          .from(dbUserTable)
          .where(eq(dbUserTable.id, userID))
          .get();

        if (!user) return c.json({ error: "User not found" }, 404);

        // 2. Retrieve expected challenge
        const challenges = await db
          .select()
          .from(webauthnChallengesTable)
          .where(
            and(
              eq(webauthnChallengesTable.user_id, user.id),
              eq(webauthnChallengesTable.clientID, clientID),
            ),
          )
          .orderBy(desc(webauthnChallengesTable.created_at))
          .limit(1);

        const challengeRecord = challenges[0];
        if (
          !challengeRecord ||
          new Date(challengeRecord.expires_at) < new Date()
        ) {
          return c.json({ error: "Challenge expired or not found" }, 400);
        }

        // 3. Get Credential Public Key
        const credId = payload.id;
        const [storedCred] = await db
          .select({
            publicKey: webauthnCredentialsTable.public_key,
            counter: webauthnCredentialsTable.counter,
            transports: webauthnCredentialsTable.transports,
          })
          .from(webauthnCredentialsTable)
          .where(eq(webauthnCredentialsTable.credential_id, credId));

        if (!storedCred) {
          return c.json({ error: "Credential not found" }, 400);
        }

        // 4. Verify
        let verification;
        try {
          // Use helper instead of Buffer to be compliant with "No Node.js deps" constraint
          // storedCred.publicKey is likely Base64URL or Base64 string.
          const publicKey = base64UrlToUint8Array(storedCred.publicKey);

          verification = await verifyAuthenticationResponse({
            response: payload,
            expectedChallenge: challengeRecord.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpID,
            credential: {
              publicKey: new Uint8Array(publicKey),
              id: credId,
              counter: storedCred.counter,
              transports: storedCred.transports
                ? (storedCred.transports as AuthenticatorTransportFuture[])
                : undefined,
            },
            requireUserVerification: true,
          });
        } catch (error) {
          console.error("Verification error:", error);
          return c.json({ error: "Verification failed" }, 400);
        }

        if (verification.verified) {
          // 5. Update counter
          await db
            .update(webauthnCredentialsTable)
            .set({
              counter: verification.authenticationInfo.newCounter,
            })
            .where(eq(webauthnCredentialsTable.credential_id, credId));

          // Cleanup challenge
          await db
            .delete(webauthnChallengesTable)
            .where(eq(webauthnChallengesTable.id, challengeRecord.id));

          // Finalize session
          //TODO: make it fit with the subject
          return ctx.success(c, { id: user.id });
        } else {
          return c.json({ error: "Invalid signature" }, 400);
        }
      });

      routes.get("/client.js", async (c) =>
        c.newResponse(ClientScript as string, 200, {
          "Content-Type": "application/javascript",
        }),
      );
    },
  };
}

export { PassKeyUI };
