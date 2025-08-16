export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function sanitizeWalletAddress(address: string): string {
  return address.trim();
}

export function sanitizeString(str: string): string {
  return str.trim().replace(/\s+/g, " ");
}

export function sanitizeMetadata(
  metadata: Record<string, any>
): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Remove any potentially dangerous keys
    if (!key.startsWith("$") && !key.startsWith("__")) {
      if (typeof value === "string") {
        sanitized[key] = sanitizeString(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}
