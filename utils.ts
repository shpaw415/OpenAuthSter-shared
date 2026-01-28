export function getCookiesFromRequest(
  request: Request,
): Record<string, string> {
  const cookieHeader = request.headers.get("cookie");
  const cookies: Record<string, string> = {};

  if (cookieHeader) {
    const cookiePairs = cookieHeader.split("; ");
    for (const pair of cookiePairs) {
      const [name, value] = pair.split("=") as [string, string];
      cookies[name] = decodeURIComponent(value);
    }
  }

  return cookies;
}

export function createCookieContent(
  name: string,
  value: string,
  options?: { path?: string; maxAge?: number; httpOnly?: boolean },
): string {
  let cookieString = `${name}=${encodeURIComponent(value)}`;

  if (options?.path) {
    cookieString += `; Path=${options.path}`;
  }

  if (options?.maxAge !== undefined) {
    cookieString += `; Max-Age=${options.maxAge}`;
  }

  if (options?.httpOnly) {
    cookieString += `; HttpOnly`;
  }

  return cookieString;
}
