// /services/cpmm.ts

import type { CPMMResult, PriceResult } from "../types/index.js";

/**
 * Constant Product Market Maker (CPMM) implementation
 * Maintains invariant k = yes_shares * no_shares
 */

/**
 * Calculate current prices based on share reserves
 */
export function calcPrice(yesShares: number, noShares: number): PriceResult {
  const total = yesShares + noShares;

  if (total === 0) {
    return { priceYes: 0.5, priceNo: 0.5 };
  }

  // Price is the marginal cost of next infinitesimal share
  // For CPMM: price_yes = no_shares / total
  const priceYes = noShares / total;
  const priceNo = yesShares / total;

  return { priceYes, priceNo };
}

/**
 * Calculate shares received when buying YES with given amount
 * Solves the integral: ∫ (k/x) dx from y0 to y1 = amount
 * Where k = y0 * n0 (constant product)
 */
export function buyYes(
  yesShares: number,
  noShares: number,
  amount: number
): CPMMResult {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const k = yesShares * noShares;

  if (k === 0) {
    throw new Error("Market has no liquidity");
  }

  // For buying YES: we add to yes_shares, subtract from no_shares
  // Cost integral: ∫(k/n) dn from n0 to n1 = k * ln(n0/n1) = amount
  // Solving: n1 = n0 * exp(-amount/k)
  const newNoShares = noShares * Math.exp(-amount / k);
  const newYesShares = k / newNoShares;

  const sharesReceived = newYesShares - yesShares;
  const avgPrice = amount / sharesReceived;

  return {
    newYes: newYesShares,
    newNo: newNoShares,
    shares: sharesReceived,
    avgPrice,
  };
}

/**
 * Calculate shares received when buying NO with given amount
 */
export function buyNo(
  yesShares: number,
  noShares: number,
  amount: number
): CPMMResult {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const k = yesShares * noShares;

  if (k === 0) {
    throw new Error("Market has no liquidity");
  }

  // For buying NO: we add to no_shares, subtract from yes_shares
  // Cost integral: ∫(k/y) dy from y0 to y1 = k * ln(y0/y1) = amount
  // Solving: y1 = y0 * exp(-amount/k)
  const newYesShares = yesShares * Math.exp(-amount / k);
  const newNoShares = k / newYesShares;

  const sharesReceived = newNoShares - noShares;
  const avgPrice = amount / sharesReceived;

  return {
    newYes: newYesShares,
    newNo: newNoShares,
    shares: sharesReceived,
    avgPrice,
  };
}

/**
 * Validate CPMM invariant (for testing)
 */
export function validateInvariant(
  oldYes: number,
  oldNo: number,
  newYes: number,
  newNo: number,
  tolerance: number = 1e-10
): boolean {
  const oldK = oldYes * oldNo;
  const newK = newYes * newNo;
  const diff = Math.abs(newK - oldK) / oldK;
  return diff <= tolerance;
}

/**
 * Calculate cost to buy specific number of shares
 * This is the inverse of the buy functions - given desired shares, calculate cost
 */
export function calcCostForYesShares(
  yesShares: number,
  noShares: number,
  desiredShares: number
): number {
  if (desiredShares <= 0) {
    throw new Error("Desired shares must be positive");
  }

  const k = yesShares * noShares;
  const newYesShares = yesShares + desiredShares;
  const newNoShares = k / newYesShares;

  // Cost is the integral from old to new no_shares
  const cost = k * Math.log(noShares / newNoShares);
  return cost;
}

export function calcCostForNoShares(
  yesShares: number,
  noShares: number,
  desiredShares: number
): number {
  if (desiredShares <= 0) {
    throw new Error("Desired shares must be positive");
  }

  const k = yesShares * noShares;
  const newNoShares = noShares + desiredShares;
  const newYesShares = k / newNoShares;

  // Cost is the integral from old to new yes_shares
  const cost = k * Math.log(yesShares / newYesShares);
  return cost;
}

/**
 * Calculate market impact for a trade
 */
export function calcMarketImpact(
  yesShares: number,
  noShares: number,
  side: "YES" | "NO",
  amount: number
): { priceImpact: number; newPrice: number; oldPrice: number } {
  const oldPrices = calcPrice(yesShares, noShares);
  const oldPrice = side === "YES" ? oldPrices.priceYes : oldPrices.priceNo;

  const result =
    side === "YES"
      ? buyYes(yesShares, noShares, amount)
      : buyNo(yesShares, noShares, amount);

  const newPrices = calcPrice(result.newYes, result.newNo);
  const newPrice = side === "YES" ? newPrices.priceYes : newPrices.priceNo;

  const priceImpact = Math.abs(newPrice - oldPrice) / oldPrice;

  return {
    priceImpact,
    newPrice,
    oldPrice,
  };
}
