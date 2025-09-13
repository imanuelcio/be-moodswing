export interface User {
  id: string;
  wallet_address: string;
  created_at: string;
  updated_at: string;
  nonce?: string;
  last_login?: string;
  metadata?: Record<string, any>;
  fullname?: string;
  email?: string;
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

export interface User {
  id: string;
  address: string;
  created_at: string;
  role?: "admin" | "user";
}

export interface Market {
  id: string;
  title: string;
  topic?: string;
  yes_shares: number;
  no_shares: number;
  k_liquidity: number;
  status: "OPEN" | "CLOSED" | "RESOLVED";
  resolved_outcome?: "YES" | "NO";
  close_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  market_id: string;
  side: "YES" | "NO";
  shares: number;
  points_spent: number;
  created_at: string;
}

export interface PointsLedger {
  id: string;
  user_id: string;
  delta: number;
  balance: number;
  reason:
    | "bet"
    | "payout"
    | "monthly_grant"
    | "tip"
    | "tip_received"
    | "initial";
  ref_type?: "market" | "post" | "system";
  ref_id?: string;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content?: string;
  external_url?: string;
  market_id?: string;
  created_at: string;
}

export interface Tip {
  id: string;
  from_user: string;
  to_user: string;
  post_id?: string;
  points: number;
  created_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  pnl: number;
  accuracy: number;
  rank: number;
}

export interface AirdropSnapshot {
  id: string;
  period: string;
  user_id: string;
  points_balance: number;
  pnl: number;
  accuracy: number;
  airdrop_score: number;
  created_at: string;
}

export interface IdempotencyKey {
  key: string;
  user_id: string;
  route: string;
  body_hash: string;
  response?: any;
  created_at: string;
}

export interface SSEMessage {
  event: string;
  id?: string;
  data: any;
}

export interface MarketSnapshot {
  marketId: string;
  yesShares: number;
  noShares: number;
  priceYes: number;
  priceNo: number;
  status: Market["status"];
  closeAt?: string;
  seq: number;
}

export interface MarketDelta {
  marketId: string;
  yesShares: number;
  noShares: number;
  priceYes: number;
  priceNo: number;
  ts: string;
  seq: number;
}

export interface CPMMResult {
  newYes: number;
  newNo: number;
  shares: number;
  avgPrice: number;
}

export interface PriceResult {
  priceYes: number;
  priceNo: number;
}
