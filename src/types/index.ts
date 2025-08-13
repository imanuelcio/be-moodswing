export interface User {
  id: string;
  wallet_address: string;
  created_at: string;
  updated_at: string;
  nonce?: string;
  last_login?: string;
  metadata?: Record<string, any>;
}

export interface AuthRequest {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface NonceResponse {
  nonce: string;
  message: string;
}

export interface AuthResponse {
  status: Boolean;
  message: string;
  user: User;
}

export interface JWTPayload {
  userId: string;
  walletAddress: string;
  iat?: number;
  exp?: number;
}
