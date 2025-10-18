import { setCookie } from "hono/cookie";

export default function StoreCookieInResponse(
  c: Parameters<typeof setCookie>[0],
  name: Parameters<typeof setCookie>[1],
  value: Parameters<typeof setCookie>[2],
  options: Parameters<typeof setCookie>[3]
) {
  return setCookie(c, name, value, options);
}
