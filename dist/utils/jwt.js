import { setCookie } from "hono/cookie";
export default function StoreCookieInResponse(c, name, value, options) {
    return setCookie(c, name, value, options);
}
