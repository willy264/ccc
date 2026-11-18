import { ccc } from "@ckb-ccc/core";
import { expect, it } from "vitest";
import { deriveStealthPayment, signStealthSpend } from "../src/index.js";
import vector from "./vector.json";

it("signs each input over the raw hash and accounts for subminimum change", () => {
  const client = { addressPrefix: "ckt" };
  const identifier = vector.viewPublicKey + vector.spendPublicKey.slice(2);
  const inputs = [0, 1].map((index) => ccc.Cell.from({
    outPoint: { txHash: `0x${"11".repeat(32)}`, index },
    cellOutput: {
      capacity: 20_000_000_000n,
      lock: deriveStealthPayment(client, identifier).lock,
    },
    outputData: "0x",
  }));
  const options = { ...vector, inputs, feeRate: 1000n };
  const { tx, fee, changeCapacity } = signStealthSpend(client, options);
  expect(tx.cellDeps).toHaveLength(2);
  expect(fee).toBe(tx.estimateFee(options.feeRate));
  expect(changeCapacity + fee).toBe(40_000_000_000n);
  inputs.forEach(({ cellOutput: { lock } }, index) => {
    const signature = tx.getWitnessArgsUnsafe(index)?.lock ?? "0x";
    expect(ccc.bytesFrom(signature)).toHaveLength(65);
    const recovered = ccc.recoverMessageSecp256k1(tx.hash(), signature);
    expect(ccc.hashCkb(recovered).slice(2, 42)).toBe(lock.args.slice(-40));
  });
  const dust = signStealthSpend(client, {
    ...options,
    payment: { identifier, capacity: 35_000_000_000n },
  });
  expect(dust.tx.outputs).toHaveLength(1);
  expect(dust.changeCapacity).toBe(0n);
  expect(dust.extraFee).toBe(dust.fee - dust.tx.estimateFee(options.feeRate));
});
