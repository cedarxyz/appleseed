/**
 * Comment Templates
 *
 * Templates for GitHub PR comments in response to user actions.
 */

import type { Config } from "../types";

// =============================================================================
// Verification Comments
// =============================================================================

/**
 * Comment when user provides a valid address.
 */
export function validAddressComment(
  username: string,
  address: string,
  config: Config
): string {
  return `Thanks @${username}! 🎉

We've received your address: \`${address}\`

Your sBTC will be sent within 24 hours. Once it arrives, the aibtc-yield skill will auto-deposit it to start earning.

**Next steps:**
- Your Moltbot can now hold and transact Bitcoin
- Yield accrues automatically (~5% APY)
- Run \`aibtc-cli status\` to check your balance

Join our Discord to connect with other builders: ${config.discordLink}
`;
}

/**
 * Comment when user provides an invalid address.
 */
export function invalidAddressComment(username: string): string {
  return `Hey @${username}, that address doesn't look quite right.

Stacks addresses start with \`SP\` (mainnet) or \`ST\` (testnet) and are 41 characters long.

Example: \`SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7\`

**Quick fix:** Run \`aibtc-cli address\` to get your correct address.

Reply with your address and we'll get you set up!
`;
}

// =============================================================================
// Airdrop Comments
// =============================================================================

/**
 * Comment when airdrop is sent successfully.
 */
export function airdropSentComment(
  txid: string,
  amount: number,
  explorerUrl: string,
  config: Config
): string {
  const amountFormatted = amount >= 100000000
    ? `${(amount / 100000000).toFixed(8)} sBTC`
    : `${amount.toLocaleString()} sats`;

  return `🎉 **sBTC Sent!**

Transaction: [${txid.substring(0, 8)}...](${explorerUrl})
Amount: ${amountFormatted}

## You're in the Bitcoin AI agent economy now

Your sBTC is in your wallet. If you installed aibtc-cli with yield enabled, it's already earning ~5% APY.

**Check your status:**
\`\`\`bash
aibtc-cli status
\`\`\`

**What's next:**
- 🤖 Your Moltbot can now transact in Bitcoin
- 📈 Yield accrues automatically via Zest/Hermetica
- 🔧 Build agents that earn and spend sBTC

**Connect with builders:**
- Discord: ${config.discordLink}
- Twitter: ${config.twitterLink}

Welcome to AIBTC! 🌱
`;
}

/**
 * Comment when airdrop fails.
 */
export function airdropFailedComment(
  username: string,
  error: string,
  config: Config
): string {
  return `Hey @${username}, we hit a snag sending your sBTC.

Error: ${error}

Don't worry - we'll retry this manually. In the meantime, join our Discord if you need help: ${config.discordLink}
`;
}

// =============================================================================
// Status Comments
// =============================================================================

/**
 * Comment acknowledging user engagement.
 */
export function engagementAckComment(username: string): string {
  return `Hey @${username}! Thanks for your interest.

To claim your sBTC airdrop, please:

1. Install aibtc-cli: \`npx aibtc-cli install\`
2. Get your address: \`aibtc-cli address\`
3. Reply here with your Stacks address (starts with \`SP...\`)

We'll send your sBTC within 24 hours of receiving your address!
`;
}

/**
 * Comment when PR is about to expire (30 day warning).
 */
export function expirationWarningComment(username: string, config: Config): string {
  return `Hey @${username}, just checking in!

This invitation will expire in 7 days. If you'd still like to join the Bitcoin AI agent economy:

1. Run \`npx aibtc-cli install\`
2. Reply with your Stacks address

Questions? ${config.calendlyLink}
`;
}
