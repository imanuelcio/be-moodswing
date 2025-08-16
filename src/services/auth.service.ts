import { SupabaseService } from "./supabase.service.js";
import { generateNonce, verifySignature } from "../utils/crypto.js";
import type { User } from "../types/index.js";

export class AuthService {
  private supabaseService: SupabaseService;

  constructor() {
    this.supabaseService = new SupabaseService();
  }

  async authenticateWallet(
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<User | null> {
    // Get user from database
    const user = await this.supabaseService.getUserByWallet(walletAddress);

    if (!user) {
      return null;
    }

    // Verify signature
    const isValid = verifySignature(message, signature, walletAddress);

    if (!isValid) {
      throw new Error("Invalid signature");
    }

    // Verify nonce
    if (!user.nonce || !message.includes(user.nonce)) {
      throw new Error("Invalid nonce");
    }

    // Update last login
    const updatedUser = await this.supabaseService.updateUser(user.id, {
      last_login: new Date().toISOString(),
      nonce: undefined, // Clear nonce after successful auth
    });

    return updatedUser;
  }

  async generateAuthChallenge(walletAddress: string): Promise<{
    nonce: string;
    message: string;
  }> {
    const nonce = generateNonce();

    // Upsert user with new nonce
    await this.supabaseService.upsertUser({
      wallet_address: walletAddress.toLowerCase(),
      nonce,
    });

    const message = `Sign this message to authenticate with your wallet.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;

    return { nonce, message };
  }
}
