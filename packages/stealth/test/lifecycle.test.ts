import { expect, it } from "vitest";
import { runLifecycle } from "../scripts/testnet-lifecycle.mjs";
import * as stealth from "../src/index.js";

it.skipIf(process.env.STEALTH_LIVE_LIFECYCLE !== "1")(
  "scans a funded stealth cell, spends it, and scans the fresh change",
  async () => {
    const funding = process.env.STEALTH_LIFECYCLE_FUND_OUTPOINT;
    if (!funding) throw new Error("Set STEALTH_LIFECYCLE_FUND_OUTPOINT to a fresh funded cell.");
    const result = await runLifecycle(stealth, "spend", funding);
    expect(result.spendHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.changeIndex).toBe(0n);
  },
  180_000,
);
