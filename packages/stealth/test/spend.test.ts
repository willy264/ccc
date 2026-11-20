import { ccc } from "@ckb-ccc/core";
import { expect, it } from "vitest";
import {
  deriveStealthPayment,
  signStealthSpend,
  StealthError,
} from "../src/index.js";
import vector from "./vector.json";

const client = { addressPrefix: "ckt" };
const identifier = vector.viewPublicKey + vector.spendPublicKey.slice(2);
const total = 40_000_000_000n;

function spendOptions() {
  const inputs = [0, 1].map((index) =>
    ccc.Cell.from({
      outPoint: { txHash: `0x${"11".repeat(32)}`, index },
      cellOutput: {
        capacity: 20_000_000_000n,
        lock: deriveStealthPayment(client, identifier).lock,
      },
      outputData: "0x",
    }),
  );
  return { ...vector, inputs, feeRate: 1000n };
}

it("signs each input over the raw hash", () => {
  const options = spendOptions();
  const { tx, fee, changeCapacity } = signStealthSpend(client, options);
  expect(tx.cellDeps).toHaveLength(2);
  expect(fee).toBe(tx.estimateFee(options.feeRate));
  expect(changeCapacity + fee).toBe(40_000_000_000n);
  options.inputs.forEach(({ cellOutput: { lock } }, index) => {
    const signature = tx.getWitnessArgsUnsafe(index)?.lock ?? "0x";
    expect(ccc.bytesFrom(signature)).toHaveLength(65);
    const recovered = ccc.recoverMessageSecp256k1(tx.hash(), signature);
    expect(ccc.hashCkb(recovered).slice(2, 42)).toBe(lock.args.slice(-40));
  });
});

it("adds a small leftover to the fee under the default cap", () => {
  const options = spendOptions();
  // A sweep and a fixed payment without change each have one stealth output.
  const estimate = signStealthSpend(client, options).fee;
  const payment = { identifier, capacity: total - estimate - 1n };
  const result = signStealthSpend(client, { ...options, payment });
  expect(result.tx.outputs).toHaveLength(1);
  expect(result.extraFee).toBe(1n);
  expect(result.fee).toBe(estimate + 1n);
});

it("rejects subminimum change exceeding the default cap", () => {
  const options = spendOptions();
  const estimate = signStealthSpend(client, options).fee;
  const excess = 5_000_000_000n - estimate;
  const payment = { identifier, capacity: total - 5_000_000_000n };
  expect(() => signStealthSpend(client, { ...options, payment })).toThrow(
    expect.objectContaining({
      constructor: StealthError,
      code: "EXCESSIVE_FEE",
      message: expect.stringContaining(`add ${excess} shannons`),
    }),
  );
});

it("accepts subminimum change up to an explicitly authorized cap", () => {
  const options = spendOptions();
  const estimate = signStealthSpend(client, options).fee;
  const dust = signStealthSpend(client, {
    ...options,
    payment: { identifier, capacity: 35_000_000_000n },
    maxExtraFee: 5_000_000_000n - estimate,
  });
  expect(dust.tx.outputs).toHaveLength(1);
  expect(dust.changeCapacity).toBe(0n);
  expect(dust.extraFee).toBe(dust.fee - dust.tx.estimateFee(options.feeRate));
});
