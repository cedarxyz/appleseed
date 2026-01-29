# Appleseed v2

Distribution engine for Bitcoin AI agents. Discovers AI/agent builders on GitHub, qualifies them, delivers personalized PR-based outreach, verifies wallet setup, and airdrops sBTC.

## Live Dashboard

**[appleseed-dashboard.pages.dev](https://appleseed-dashboard.pages.dev)**

## Architecture

```
Scanner → Qualifier → Outreach → Verifier → Airdrop
    ↓         ↓          ↓          ↓          ↓
              SQLite Database (local)
                        ↓
                   Sync to D1
                        ↓
              Dashboard (Cloudflare Pages)
```

## Pipeline

| Stage | Description |
|-------|-------------|
| **Scanner** | Searches GitHub for AI/agent builders (MCP, LangChain, AutoGPT, CrewAI, Bitcoin+AI) |
| **Qualifier** | Scores prospects and assigns tiers (A/B/C/D) based on activity, stars, crypto involvement |
| **Outreach** | Opens personalized PRs inviting developers to install `aibtc-cli` |
| **Verifier** | Monitors PR comments for Stacks wallet addresses |
| **Airdrop** | Sends sBTC to verified builders based on tier |

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your private key

# Run a scan
npx tsx src/index.ts scan --strategy mcp --limit 20

# Qualify prospects
npx tsx src/index.ts qualify --pending

# Check stats
npx tsx src/index.ts stats

# Sync to cloud dashboard
npx tsx src/index.ts sync
```

## CLI Commands

```bash
# Discovery
npx tsx src/index.ts scan --strategy mcp --limit 50
npx tsx src/index.ts scan --strategy langchain --limit 50
npx tsx src/index.ts scan --strategy bitcoin_ai --limit 50

# Qualification
npx tsx src/index.ts qualify --pending

# Outreach (use --dry-run first!)
npx tsx src/index.ts outreach --tier A --limit 1 --dry-run
npx tsx src/index.ts outreach --tier A --limit 1

# Verification
npx tsx src/index.ts verify --check

# Airdrop
npx tsx src/index.ts airdrop --pending --limit 5

# Status
npx tsx src/index.ts stats
npx tsx src/index.ts status --prospect-id 1
npx tsx src/index.ts treasury

# Sync to cloud
npx tsx src/index.ts sync
```

## Daemon

Run the pipeline automatically on a schedule:

```bash
# Run once
npx tsx src/daemon.ts --once

# Run every 30 minutes
npx tsx src/daemon.ts --interval 30

# Run with specific features disabled
npx tsx src/daemon.ts --no-airdrop --no-verify
```

## Dashboard

The dashboard is a Next.js app deployed to Cloudflare Pages.

```bash
cd dashboard
npm install
npm run dev    # Local development
npm run build  # Build for production
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APPLESEED_PRIVATE_KEY` | Yes | Treasury wallet private key (hex) |
| `STACKS_NETWORK` | Yes | `mainnet` or `testnet` |
| `GITHUB_TOKEN` | No | GitHub token (or use `gh auth login`) |
| `MAX_DAILY_PRS` | No | Rate limit for PRs (default: 50) |
| `MAX_DAILY_AIRDROPS` | No | Rate limit for airdrops (default: 20) |
| `AIRDROP_TIER_A_SATS` | No | Airdrop amount for Tier A (default: 10000) |
| `AIRDROP_TIER_B_SATS` | No | Airdrop amount for Tier B (default: 5000) |
| `AIRDROP_TIER_C_SATS` | No | Airdrop amount for Tier C (default: 2500) |

## Scoring

Prospects are scored on:

| Factor | Points |
|--------|--------|
| Claude/MCP usage | 30 |
| AI Agent framework | 25 |
| Repository stars | 15 |
| Recent activity | 15 |
| Followers | 10 |
| Crypto/blockchain work | 5 |

Tiers:
- **A (80+)**: Hot leads - high-value AI builders
- **B (40-79)**: Warm leads - active developers
- **C (20-39)**: Cool leads - potential targets
- **D (<20)**: Skip - low priority

## Project Structure

```
appleseedv2/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── daemon.ts       # Scheduled runner
│   ├── scanner.ts      # GitHub search
│   ├── qualifier.ts    # Scoring algorithm
│   ├── outreach.ts     # PR-based outreach
│   ├── verifier.ts     # PR comment monitoring
│   ├── airdrop.ts      # sBTC distribution
│   ├── db.ts           # SQLite database
│   ├── wallet.ts       # Stacks wallet ops
│   ├── github.ts       # GitHub API (via gh CLI)
│   ├── config.ts       # Environment config
│   ├── types.ts        # TypeScript types
│   └── templates/      # PR and comment templates
├── dashboard/          # Next.js dashboard
│   ├── src/app/        # App router pages
│   └── worker/         # Cloudflare Worker API
├── data/               # SQLite database (gitignored)
└── scripts/            # Utility scripts
```

## License

MIT
