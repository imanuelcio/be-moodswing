import { z } from "zod";

/**
 * Custom validators for specific use cases
 */

// Validate Solana signature (base58)
export function isValidSolanaSignature(signature: string): boolean {
  try {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return (
      base58Regex.test(signature) &&
      signature.length >= 87 &&
      signature.length <= 88
    );
  } catch {
    return false;
  }
}

// Validate Solana public key
export function isValidSolanaPublicKey(publicKey: string): boolean {
  try {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(publicKey);
  } catch {
    return false;
  }
}

// Validate strong password (for future use if needed)
export function isStrongPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongPasswordRegex.test(password);
}

// Custom Zod schemas with additional validation
export const solanaSignatureSchema = z
  .string()
  .refine(isValidSolanaSignature, {
    message: "Invalid Solana signature format",
  });

export const solanaPublicKeySchema = z
  .string()
  .refine(isValidSolanaPublicKey, {
    message: "Invalid Solana public key format",
  });
