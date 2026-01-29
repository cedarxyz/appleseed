import { config as loadEnv } from "dotenv";
import type { Config } from "./types";

// Load .env file
loadEnv();

/**
 * Load configuration from environment variables.
 */
export function loadConfig(): Config {
  const privateKey = process.env.APPLESEED_PRIVATE_KEY || "";

  return {
    // Wallet
    privateKey,
    network: (process.env.STACKS_NETWORK as "mainnet" | "testnet") || "mainnet",
    facilitatorUrl:
      process.env.FACILITATOR_URL || "https://facilitator.stacksx402.com",
    walletAddress: process.env.PAYMENT_ADDRESS || "",

    // CRM
    crmApiUrl:
      process.env.CRM_API_URL || "https://x402crm-v2-staging.c3dar.workers.dev",

    // Rate limits
    maxDailyPRs: parseInt(process.env.MAX_DAILY_PRS || "50", 10),
    maxDailyAirdrops: parseInt(process.env.MAX_DAILY_AIRDROPS || "20", 10),

    // Airdrop amounts (in satoshis)
    airdropTierA: parseInt(process.env.AIRDROP_TIER_A_SATS || "10000", 10),
    airdropTierB: parseInt(process.env.AIRDROP_TIER_B_SATS || "5000", 10),
    airdropTierC: parseInt(process.env.AIRDROP_TIER_C_SATS || "2500", 10),

    // Database
    dbPath: process.env.DB_PATH || "./data/appleseed.db",

    // Links for templates
    calendlyLink:
      process.env.CALENDLY_LINK || "https://calendly.com/aibtc/chat",
    discordLink: process.env.DISCORD_LINK || "https://discord.gg/aibtc",
    twitterLink:
      process.env.TWITTER_LINK || "https://twitter.com/aiaboronbitcoin",
    websiteLink: process.env.WEBSITE_LINK || "https://aibtc.dev",
    aibtcCliRepo:
      process.env.AIBTC_CLI_REPO || "https://github.com/aibtcdev/aibtc-cli",
    appleseedRepoUrl:
      process.env.APPLESEED_REPO_URL || "https://github.com/aibtcdev/appleseed",
  };
}

/**
 * Validate that required config values are present.
 */
export function validateConfig(config: Config): string[] {
  const errors: string[] = [];

  if (!config.privateKey) {
    errors.push("APPLESEED_PRIVATE_KEY is required");
  }

  if (!["mainnet", "testnet"].includes(config.network)) {
    errors.push("STACKS_NETWORK must be 'mainnet' or 'testnet'");
  }

  return errors;
}

/**
 * Get airdrop amount for a given tier.
 */
export function getAirdropAmount(
  config: Config,
  tier: "A" | "B" | "C"
): number {
  switch (tier) {
    case "A":
      return config.airdropTierA;
    case "B":
      return config.airdropTierB;
    case "C":
      return config.airdropTierC;
  }
}
