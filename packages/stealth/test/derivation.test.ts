import { ccc } from "@ckb-ccc/core";
import { createECDH, createHash } from "node:crypto";
import { expect, it } from "vitest";
import { addStealthOutput, deriveStealthPayment } from "../src/index.js";
import { derivePayment } from "../src/internal/derive-payment.js";
import { deriveSpendKey } from "../src/spend.js";
import vector from "./vector.json";

const identifier = vector.viewPublicKey + vector.spendPublicKey.slice(2);
const client = { addressPrefix: "ckt" };

it("matches the frozen vector and independently checks the Obscell formulas", () => {
  const payment = derivePayment(identifier, ccc.bytesFrom(vector.ephemeralKey));
  expect(payment.lock.args).toBe(vector.args);
  expect(payment.ephemeralPublicKey).toBe(vector.ephemeralPublicKey);
  expect(payment.oneTimePublicKey).toBe(vector.oneTimePublicKey);
  expect(deriveSpendKey(payment.lock, vector.viewKey, vector.spendKey)).toBe(vector.oneTimeKey);

  // OpenSSL gives the ECDH x-coordinate. For scalars 1 and 3, the
  // shared point is 3G, so its compressed parity is given by R.
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(ccc.bytesFrom(vector.viewKey));
  const r = ccc.bytesFrom(payment.ephemeralPublicKey);
  const shared = Buffer.concat([r.slice(0, 1), ecdh.computeSecret(r)]);
  const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest();
  const tweak = sha256(sha256(shared));
  expect(ccc.hexFrom(tweak)).toBe(vector.tweak);
  const scalar = BigInt(ccc.hexFrom(tweak)) + BigInt(vector.spendKey);
  ecdh.setPrivateKey(ccc.bytesFrom(`0x${scalar.toString(16).padStart(64, "0")}`));
  expect(ccc.hexFrom(ecdh.getPublicKey(undefined, "compressed"))).toBe(payment.oneTimePublicKey);
});

it("appends an empty-data output at 94 CKB and rejects smaller outputs without mutation", () => {
  const tx = ccc.Transaction.from({});
  expect(() => addStealthOutput(tx, client, identifier, 9_399_999_999n))
    .toThrow(expect.objectContaining({ code: "INSUFFICIENT_CAPACITY" }));
  expect(tx.outputs).toHaveLength(0);
  const payment = addStealthOutput(tx, client, identifier, 9_400_000_000n);
  expect(tx.outputs[0].capacity).toBe(9_400_000_000n);
  expect(tx.outputs[0].lock.args).toBe(payment.lock.args);
  expect(tx.outputsData).toEqual(["0x"]);
  expect(deriveStealthPayment(client, identifier).ephemeralPublicKey)
    .not.toBe(payment.ephemeralPublicKey);
  expect(() => deriveStealthPayment({ addressPrefix: "ckb" }, identifier))
    .toThrow(expect.objectContaining({ code: "NOT_DEPLOYED" }));
});
