import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

export function generateNonce(): string {
  return crypto.randomUUID();
}

export function createSignMessage(
  walletAddress: string,
  nonce: string
): string {
  return `Sign this message to authenticate with your wallet.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;
}

export function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const signatureBuffer = bs58.decode(signature);

    const messageBuffer = new TextEncoder().encode(message);

    const publicKeyObj = new PublicKey(publicKey);
    const publicKeyBuffer = publicKeyObj.toBuffer();

    return nacl.sign.detached.verify(
      messageBuffer,
      signatureBuffer,
      publicKeyBuffer
    );
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}
