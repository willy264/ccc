import { ccc } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { expect, it } from "vitest";
import {
  deriveSpendKey,
  deriveStealthPayment,
  scanStealthCells,
  scanStealthPayments,
  stealthScriptInfoForPrefix,
} from "../src/index.js";
import {
  createFixturePayment,
  deriveStealthPaymentForTest,
} from "../src/testing/index.js";
import vector from "./vector.json";

it("checks fixture ownership and encodes addresses using the supplied deployment", () => {
  const deployment = {
    ...stealthScriptInfoForPrefix(),
    addressPrefix: "fixture",
    stealthLock: {
      codeHash: ccc.hexFrom(new Uint8Array(32)),
      hashType: "type" as const,
    },
  };
  const identifier = vector.viewPublicKey + vector.spendPublicKey.slice(2);
  const payment = deriveStealthPaymentForTest(
    identifier,
    vector.ephemeralKey,
    deployment,
  );
  const record = createFixturePayment(
    payment,
    "200",
    "fixture-payment",
    deployment,
  );
  const scan = scanStealthPayments(
    [record],
    vector.viewKey,
    vector.spendPublicKey,
    deployment,
  );
  expect(scan.matches[0].address).toBe(payment.address);
  expect(payment.address.startsWith("fixture1")).toBe(true);
  expect(
    deriveSpendKey(record.lock, vector.viewKey, vector.spendKey, deployment),
  ).toBe(vector.oneTimeKey);
  expect(
    scanStealthPayments([record], vector.viewKey, vector.spendPublicKey)
      .rejected,
  ).toBe(1);
});

it("matches plain CKB cells and deduplicates outpoints across the iterator", async () => {
  const identifier = vector.viewPublicKey + vector.spendPublicKey.slice(2);
  const { lock, ephemeralPublicKey } = deriveStealthPayment(
    { addressPrefix: "ckt" },
    identifier,
  );
  const cell = ccc.Cell.from({
    outPoint: { txHash: `0x${"11".repeat(32)}`, index: 0 },
    cellOutput: { capacity: 9_400_000_000n, lock },
    outputData: "0x",
  });
  const client = {
    addressPrefix: "ckt",
    async *findCells(key: ccc.ClientCollectableSearchKeyLike) {
      expect(key).toMatchObject({
        scriptType: "lock",
        scriptSearchMode: "prefix",
        script: { args: "0x" },
      });
      yield cell;
      yield cell;
    },
  };
  const matches = await scanStealthCells(client, vector);
  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({ cell, ephemeralPublicKey });
  expect(
    await scanStealthCells(client, { ...vector, viewKey: vector.spendKey }),
  ).toEqual([]);
});

it.skipIf(process.env.STEALTH_LIVE_SCAN !== "1")(
  "finds a known live testnet stealth outpoint",
  async () => {
    const { STEALTH_VIEW_SECRET, STEALTH_SPEND_SECRET, STEALTH_SCAN_OUTPOINT } =
      process.env;
    if (
      !STEALTH_VIEW_SECRET ||
      !STEALTH_SPEND_SECRET ||
      !STEALTH_SCAN_OUTPOINT
    ) {
      throw new Error(
        "Configure the view and spend secrets and expected scan outpoint.",
      );
    }
    const owner = ccc.ClientPublicTestnet.open({
      urls: ["https://testnet.ckb.dev/"],
    });
    try {
      const matches = await scanStealthCells(owner.value, {
        viewKey: STEALTH_VIEW_SECRET,
        spendPublicKey: ccc.hexFrom(
          secp256k1.getPublicKey(ccc.bytesFrom(STEALTH_SPEND_SECRET)),
        ),
      });
      expect(
        matches.map(
          ({ cell }) => `${cell.outPoint.txHash}:${cell.outPoint.index}`,
        ),
      ).toContain(STEALTH_SCAN_OUTPOINT);
    } finally {
      await owner.dispose();
    }
  },
  60_000,
);
