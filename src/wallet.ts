import type { Config } from "./types";

export interface WalletInfo {
  address: string;
  stxBalance: string;
  sbtcBalance: string;
}

const SBTC_CONTRACT_MAINNET =
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_CONTRACT_TESTNET =
  "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token";

/**
 * Get wallet address from private key using x402-stacks SDK.
 */
export async function getWalletAddress(config: Config): Promise<string> {
  const { privateKeyToAccount } = await import("x402-stacks");
  const account = privateKeyToAccount(config.privateKey, config.network);
  return account.address;
}

/**
 * Get Hiro API base URL for the network.
 */
function getHiroBaseUrl(network: "mainnet" | "testnet"): string {
  return network === "mainnet"
    ? "https://api.hiro.so"
    : "https://api.testnet.hiro.so";
}

/**
 * Check wallet balances via Hiro API.
 */
export async function getWalletInfo(
  address: string,
  config: Config
): Promise<WalletInfo> {
  const baseUrl = getHiroBaseUrl(config.network);

  const res = await fetch(`${baseUrl}/extended/v1/address/${address}/balances`);
  if (!res.ok) {
    throw new Error(`Failed to fetch wallet balances: ${res.status}`);
  }

  const data = (await res.json()) as {
    stx: { balance: string };
    fungible_tokens: Record<string, { balance: string }>;
  };

  const stxBalance = data.stx?.balance || "0";

  // Find sBTC balance
  const sbtcKey = Object.keys(data.fungible_tokens || {}).find(
    (k) => k.includes("sbtc-token") || k.includes("token-sbtc")
  );
  const sbtcBalance = sbtcKey ? data.fungible_tokens[sbtcKey].balance : "0";

  return { address, stxBalance, sbtcBalance };
}

/**
 * Check if a Stacks address is valid.
 */
export function isValidStacksAddress(address: string): boolean {
  // Mainnet addresses start with SP, testnet with ST
  // Both are 41 characters in c32check format
  const mainnetRegex = /^SP[0-9A-HJ-NP-Z]{38,39}$/;
  const testnetRegex = /^ST[0-9A-HJ-NP-Z]{38,39}$/;
  return mainnetRegex.test(address) || testnetRegex.test(address);
}

/**
 * Format satoshis to human-readable display.
 */
export function formatSats(sats: string | number): string {
  const n = typeof sats === "string" ? parseInt(sats, 10) : sats;
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(8)} sBTC`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(6)} sBTC`;
  return `${n.toLocaleString()} sats`;
}

/**
 * Format STX microunits to human-readable display.
 */
export function formatStx(microStx: string | number): string {
  const n = typeof microStx === "string" ? parseInt(microStx, 10) : microStx;
  return `${(n / 1_000_000).toFixed(6)} STX`;
}

/**
 * Get sBTC contract address for the network.
 */
export function getSbtcContract(
  network: "mainnet" | "testnet"
): string {
  return network === "mainnet" ? SBTC_CONTRACT_MAINNET : SBTC_CONTRACT_TESTNET;
}

/**
 * Get explorer URL for a transaction.
 */
export function getExplorerUrl(
  txid: string,
  network: "mainnet" | "testnet"
): string {
  const base =
    network === "mainnet"
      ? "https://explorer.stacks.co/txid"
      : "https://explorer.stacks.co/txid";
  const suffix = network === "testnet" ? "?chain=testnet" : "";
  return `${base}/${txid}${suffix}`;
}
