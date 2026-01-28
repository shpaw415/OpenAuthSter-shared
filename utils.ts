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
