import jwt from "jsonwebtoken";
import type { JWTPayload } from "../types/index.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d", // Token expires in 7 days
  });
}
export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" }); // Token expires in 30 days
}
export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}
