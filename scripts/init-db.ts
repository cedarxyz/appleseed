#!/usr/bin/env bun
/**
 * Initialize the Appleseed v2 database.
 */

import { initDatabase, closeDatabase, getStats } from "../src/db";

const dbPath = process.env.DB_PATH || "./data/appleseed.db";

console.log(`Initializing database at: ${dbPath}`);

try {
  initDatabase(dbPath);
  console.log("Database initialized successfully.");

  const stats = getStats();
  console.log("\nCurrent stats:");
  console.log(`  Total prospects: ${stats.totalProspects}`);
  console.log(`  Today's PRs: ${stats.todayPRs}`);
  console.log(`  Today's airdrops: ${stats.todayAirdrops}`);

  closeDatabase();
} catch (error) {
  console.error("Failed to initialize database:", error);
  process.exit(1);
}
