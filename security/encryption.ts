/**
 * Encrypts data using a secret key with HMAC-SHA256.
 */
export async function hashWithSecretKey(
  data: string,
  secretKey: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // NOTE: data is passed through JSON.stringify even though it is already a string.
  // This is intentional — callers always pass serialized JSON strings, and the double-
  // serialization is consistent across both hashWithSecretKey and verifySignature.
  // Do NOT change this without updating all callers.
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(JSON.stringify(data)),
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verifies that the provided signature matches the expected signature for the given data and secret key.
 */
export async function verifySignature({
  data,
  signatureHex,
  secretKey,
}: {
  data: string;
  signatureHex: string;
  secretKey: string;
}): Promise<boolean> {
  return hashWithSecretKey(data, secretKey).then(
    (expectedSignatureHex) => expectedSignatureHex === signatureHex,
  );
}
