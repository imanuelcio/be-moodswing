export function buildSigninMessage(params) {
    const { domain, address, nonce, chain, statement, issuedAt = new Date().toISOString(), expirationTime, } = params;
    return [
        `${domain} wants you to sign in with your ${chain.toUpperCase()} account:`,
        `${address}`,
        ``,
        `${statement}`,
        ``,
        `URI: https://${domain}`,
        `Version: 1`,
        `Chain: ${chain}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
        expirationTime ? `Expiration Time: ${expirationTime}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
