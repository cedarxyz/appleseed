/**
 * Airdrop Module
 *
 * Distributes sBTC to verified builders.
 */

import type {
  Config,
  Prospect,
  AirdropOptions,
  AirdropTransaction,
  AirdropStatus,
  Tier,
} from "./types";
import {
  getProspects,
  getProspectById,
  updateProspectAirdrop,
  getDailyLimits,
  incrementDailyAirdrops,
  logActivity,
} from "./db";
import {
  getWalletAddress,
  getWalletInfo,
  formatSats,
  getExplorerUrl,
  getSbtcContract,
} from "./wallet";
import { postPRComment, parsePRUrl } from "./github";
import { airdropSentComment, airdropFailedComment } from "./templates/comments";
import { getAirdropAmount } from "./config";

// =============================================================================
// Constants
// =============================================================================

// Minimum treasury balance to maintain (in satoshis)
const MIN_TREASURY_BALANCE = 100000; // 0.001 sBTC

// Delay between airdrops (ms)
const AIRDROP_DELAY_MS = 5000;

// =============================================================================
// Transaction Building
// =============================================================================

/**
 * Build and broadcast an sBTC transfer transaction.
 */
async function sendSbtc(
  recipient: string,
  amountSats: number,
  memo: string,
  config: Config
): Promise<{ txid: string } | { error: string }> {
  try {
    const {
      makeContractCall,
      broadcastTransaction,
      AnchorMode,
      PostConditionMode,
      FungibleConditionCode,
      makeContractFungiblePostCondition,
      getAddressFromPrivateKey,
      TransactionVersion,
      bufferCVFromString,
      uintCV,
      standardPrincipalCV,
    } = await import("@stacks/transactions");

    const sbtcContract = getSbtcContract(config.network);
    const [contractAddress, contractName] = sbtcContract.split(".");

    // Derive sender address
    const txVersion =
      config.network === "mainnet"
        ? TransactionVersion.Mainnet
        : TransactionVersion.Testnet;
    const senderAddress = getAddressFromPrivateKey(config.privateKey, txVersion);

    // Post-condition: sender sends exactly amountSats of sBTC
    const postCondition = makeContractFungiblePostCondition(
      contractAddress,
      contractName,
      FungibleConditionCode.Equal,
      BigInt(amountSats),
      senderAddress
    );

    console.log(`  Building sBTC transfer: ${amountSats} sats to ${recipient}`);

    // Build transfer call
    // sBTC contract transfer function: (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
    const tx = await makeContractCall({
      contractAddress,
      contractName,
      functionName: "transfer",
      functionArgs: [
        uintCV(amountSats),
        standardPrincipalCV(senderAddress),
        standardPrincipalCV(recipient),
        bufferCVFromString(memo.slice(0, 34)), // Max 34 bytes
      ],
      senderKey: config.privateKey,
      network: config.network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Deny,
      postConditions: [postCondition],
      validateWithAbi: false,
    });

    // Broadcast
    const result = await broadcastTransaction(tx, config.network);

    if (result.error) {
      return { error: `Broadcast failed: ${result.error} - ${result.reason || ""}` };
    }

    let txid = result.txid;
    if (txid && !txid.startsWith("0x")) {
      txid = `0x${txid}`;
    }

    return { txid };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Wait for transaction confirmation.
 */
async function waitForConfirmation(
  txid: string,
  network: "mainnet" | "testnet",
  maxAttempts: number = 24
): Promise<{ confirmed: boolean; blockHeight?: number }> {
  const hiroBase =
    network === "mainnet"
      ? "https://api.hiro.so"
      : "https://api.testnet.hiro.so";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));

    try {
      const res = await fetch(
        `${hiroBase}/extended/v1/tx/${txid}`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (res.ok) {
        const txData = (await res.json()) as {
          tx_status?: string;
          block_height?: number;
        };

        if (txData.tx_status === "success") {
          console.log(`  TX confirmed (attempt ${attempt + 1})`);
          return { confirmed: true, blockHeight: txData.block_height };
        }

        if (txData.tx_status === "abort_by_response") {
          console.log(`  TX aborted`);
          return { confirmed: false };
        }

        console.log(`  TX pending (attempt ${attempt + 1}/${maxAttempts})...`);
      }
    } catch {
      // Ignore polling errors
    }
  }

  return { confirmed: false };
}

// =============================================================================
// Airdrop Logic
// =============================================================================

/**
 * Process airdrop for a single prospect.
 */
async function processAirdrop(
  prospect: Prospect,
  amount: number,
  config: Config
): Promise<AirdropTransaction> {
  const transaction: AirdropTransaction = {
    prospectId: prospect.id,
    recipient: prospect.stacksAddress!,
    amountSats: amount,
    memo: "Appleseed airdrop - welcome to Bitcoin agents!",
    txid: null,
    status: "pending",
    broadcastAt: null,
    confirmedAt: null,
    blockHeight: null,
  };

  // Send the transaction
  const result = await sendSbtc(
    transaction.recipient,
    transaction.amountSats,
    transaction.memo,
    config
  );

  if ("error" in result) {
    transaction.status = "failed";
    console.error(`  ✗ Failed: ${result.error}`);

    updateProspectAirdrop(prospect.id, {
      airdropStatus: "failed",
    });

    logActivity("airdrop:failed", prospect.id, {
      error: result.error,
      amount: transaction.amountSats,
    });

    // Post failure comment if we have a PR
    if (prospect.prUrl) {
      const parsed = parsePRUrl(prospect.prUrl);
      if (parsed) {
        try {
          await postPRComment(
            parsed.owner,
            parsed.repo,
            parsed.prNumber,
            airdropFailedComment(prospect.githubUsername, result.error, config)
          );
        } catch {
          // Ignore comment posting errors
        }
      }
    }

    return transaction;
  }

  transaction.txid = result.txid;
  transaction.status = "sent";
  transaction.broadcastAt = new Date().toISOString();

  console.log(`  TX broadcast: ${transaction.txid}`);

  // Update database
  updateProspectAirdrop(prospect.id, {
    airdropStatus: "sent",
    airdropTxid: transaction.txid,
    airdropAmountSats: transaction.amountSats,
    airdropSentAt: transaction.broadcastAt,
  });

  // Wait for confirmation
  console.log(`  Waiting for confirmation...`);
  const confirmation = await waitForConfirmation(transaction.txid, config.network);

  if (confirmation.confirmed) {
    transaction.status = "confirmed";
    transaction.confirmedAt = new Date().toISOString();
    transaction.blockHeight = confirmation.blockHeight ?? null;

    updateProspectAirdrop(prospect.id, {
      airdropStatus: "confirmed",
    });

    logActivity("airdrop:confirmed", prospect.id, {
      txid: transaction.txid,
      amount: transaction.amountSats,
      blockHeight: transaction.blockHeight,
    });

    // Post success comment
    if (prospect.prUrl) {
      const parsed = parsePRUrl(prospect.prUrl);
      if (parsed) {
        try {
          const explorerUrl = getExplorerUrl(transaction.txid, config.network);
          await postPRComment(
            parsed.owner,
            parsed.repo,
            parsed.prNumber,
            airdropSentComment(
              transaction.txid,
              transaction.amountSats,
              explorerUrl,
              config
            )
          );
        } catch {
          // Ignore comment posting errors
        }
      }
    }

    console.log(`  ✓ Airdrop confirmed`);
  } else {
    // Still mark as sent - it may confirm later
    console.log(`  ⚠ TX not confirmed within timeout, marked as sent`);
  }

  return transaction;
}

/**
 * Run airdrop based on options.
 */
export async function airdrop(
  options: AirdropOptions,
  config: Config
): Promise<{
  sent: number;
  confirmed: number;
  failed: number;
  skipped: number;
  transactions: AirdropTransaction[];
}> {
  const { pending = true, limit = 5, prospectId, amount: overrideAmount } = options;

  // Check daily limit
  const dailyLimits = getDailyLimits();
  const remaining = config.maxDailyAirdrops - dailyLimits.airdropsSent;

  if (remaining <= 0) {
    console.log(`Daily airdrop limit reached (${config.maxDailyAirdrops}). Try again tomorrow.`);
    return { sent: 0, confirmed: 0, failed: 0, skipped: 0, transactions: [] };
  }

  const effectiveLimit = Math.min(limit, remaining);

  // Check treasury balance
  const treasuryAddress = await getWalletAddress(config);
  const treasuryInfo = await getWalletInfo(treasuryAddress, config);
  const treasuryBalance = parseInt(treasuryInfo.sbtcBalance, 10);

  console.log(`Treasury: ${treasuryAddress}`);
  console.log(`Balance: ${formatSats(treasuryBalance)}`);

  if (treasuryBalance < MIN_TREASURY_BALANCE) {
    console.log(`Treasury balance too low (minimum: ${formatSats(MIN_TREASURY_BALANCE)})`);
    return { sent: 0, confirmed: 0, failed: 0, skipped: 0, transactions: [] };
  }

  // Get prospects
  let prospects: Prospect[];

  if (prospectId) {
    const prospect = getProspectById(prospectId);
    prospects = prospect ? [prospect] : [];
  } else if (pending) {
    // Get verified prospects with pending airdrop
    prospects = getProspects({ airdropStatus: "pending" }).filter(
      (p) => p.addressValid && p.stacksAddress
    );
  } else {
    prospects = [];
  }

  // Limit to effective limit
  prospects = prospects.slice(0, effectiveLimit);

  console.log(`\nProcessing ${prospects.length} airdrops (limit: ${effectiveLimit})`);
  console.log(`Daily airdrops: ${dailyLimits.airdropsSent}/${config.maxDailyAirdrops}`);

  const transactions: AirdropTransaction[] = [];
  let sent = 0;
  let confirmed = 0;
  let failed = 0;
  let skipped = 0;

  for (const prospect of prospects) {
    console.log(`\n${prospect.githubUsername} (${prospect.stacksAddress}):`);

    // Validate
    if (!prospect.stacksAddress || !prospect.addressValid) {
      console.log(`  Skipping: no valid address`);
      skipped++;
      continue;
    }

    if (prospect.airdropStatus !== "pending") {
      console.log(`  Skipping: already ${prospect.airdropStatus}`);
      skipped++;
      continue;
    }

    // Determine amount
    let amount = overrideAmount;
    if (!amount && prospect.tier) {
      const tier = prospect.tier as Tier;
      if (tier !== "D") {
        amount = getAirdropAmount(config, tier);
      }
    }

    if (!amount) {
      amount = config.airdropTierC; // Default to tier C amount
    }

    // Check we have enough balance
    if (treasuryBalance - amount < MIN_TREASURY_BALANCE) {
      console.log(`  Skipping: insufficient treasury balance`);
      skipped++;
      continue;
    }

    // Process airdrop
    const tx = await processAirdrop(prospect, amount, config);
    transactions.push(tx);

    if (tx.status === "confirmed") {
      confirmed++;
      sent++;
      incrementDailyAirdrops();
    } else if (tx.status === "sent") {
      sent++;
      incrementDailyAirdrops();
    } else {
      failed++;
    }

    // Delay between airdrops
    await new Promise((r) => setTimeout(r, AIRDROP_DELAY_MS));
  }

  console.log(`\nAirdrop complete: ${sent} sent (${confirmed} confirmed), ${failed} failed, ${skipped} skipped`);

  return { sent, confirmed, failed, skipped, transactions };
}

/**
 * Check treasury status.
 */
export async function checkTreasury(
  config: Config
): Promise<{
  address: string;
  stxBalance: string;
  sbtcBalance: string;
  canAirdrop: boolean;
}> {
  const address = await getWalletAddress(config);
  const info = await getWalletInfo(address, config);

  const sbtcBalance = parseInt(info.sbtcBalance, 10);
  const canAirdrop = sbtcBalance >= MIN_TREASURY_BALANCE + config.airdropTierC;

  return {
    address,
    stxBalance: info.stxBalance,
    sbtcBalance: info.sbtcBalance,
    canAirdrop,
  };
}
