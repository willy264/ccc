import { ccc } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { assertCapacity, parseCapacity } from "./capacity.js";
import { deriveFreshChange } from "./change.js";
import { fail } from "./errors.js";
import { scalar } from "./internal/curve.js";
import { hex } from "./internal/encoding.js";
import { addressFor, assertLock } from "./internal/lock.js";
import {
  decodeStealthMetaAddress,
  encodeStealthMetaAddress,
} from "./meta-address.js";
import { stealthScriptInfoForPrefix } from "./predefined/index.js";
import { deriveSpendKey } from "./spend.js";
import type {
  DetectedPayment,
  SendDraft,
  SpendDraft,
  StealthIdentity,
  StealthPayment,
} from "./types.js";

/** Actual CCC output serialization, but no invented inputs, fee completion or signatures. */
export function buildSendDraft(
  payment: StealthPayment,
  capacityCkb: string,
  deployment = stealthScriptInfoForPrefix(),
): SendDraft {
  const lock = assertLock(payment.lock, deployment);
  const capacity = parseCapacity(capacityCkb);
  assertCapacity(capacity, lock);
  return {
    source: "SIMULATED",
    transaction: ccc.Transaction.from({
      outputs: [{ capacity, lock: lock.clone() }],
      outputsData: ["0x"],
    }),
    amountCkb: capacityCkb,
    outputAddress: addressFor(lock, deployment.addressPrefix),
    steps: [
      "LOCAL: derive the one-time recipient lock with ECDH",
      "LOCAL: build the unsigned output using ccc.Transaction.from",
      "SIMULATED: transaction.completeInputsByCapacity(signer)",
      "SIMULATED: transaction.completeFeeChangeToLock(signer, freshChange.lock) delegates to completeFee",
      "SIMULATED: signer.sendTransaction(transaction); no signature or broadcast performed",
    ],
  };
}

/**
 * Demonstrates local spend authority and fresh destinations only. A fixture has
 * no live outpoint; do not manufacture a transaction input or mark it spent.
 */
export function prepareSpendDraft(
  payment: DetectedPayment,
  identity: StealthIdentity,
  destinationMetaAddress: string,
  deployment = stealthScriptInfoForPrefix(),
): SpendDraft {
  if (payment.source !== "SIMULATED") {
    fail(
      "INVALID_FIXTURE",
      "Only simulated payments are accepted by this demo.",
    );
  }
  const expectedMeta = encodeStealthMetaAddress({
    viewPublicKey: hex(
      secp256k1.getPublicKey(scalar(identity.viewKey, "View key"), true),
    ),
    spendPublicKey: hex(
      secp256k1.getPublicKey(scalar(identity.spendKey, "Spend key"), true),
    ),
  });
  if (
    encodeStealthMetaAddress(decodeStealthMetaAddress(identity.metaAddress)) !==
    expectedMeta
  ) {
    fail(
      "INVALID_IDENTITY",
      "The change meta-address must belong to the supplied view/spend keys.",
    );
  }
  assertCapacity(payment.capacity, assertLock(payment.lock, deployment));
  const secret = scalar(
    deriveSpendKey(
      payment.lock,
      identity.viewKey,
      identity.spendKey,
      deployment,
    ),
    "One-time spend key",
  );
  const oneTimePublicKey = hex(secp256k1.getPublicKey(secret, true));
  secret.fill(0);
  return {
    source: "SIMULATED",
    oneTimePublicKey,
    destination: deriveFreshChange(destinationMetaAddress, deployment),
    change: deriveFreshChange(identity.metaAddress, deployment),
    steps: [
      "LOCAL: verify view/spend keys authorize the detected one-time lock",
      "LOCAL: derive a new recipient output and a separate fresh change address",
      "SIMULATED: select a live outpoint and complete capacity/fees with CCC",
      "SIMULATED: stealth witness signing; requires a verified lock-specific signer",
      "SIMULATED: broadcast and settlement are not performed",
    ],
  };
}

/** Rejects attempts to broadcast simulated fixture drafts. */
export function broadcastStealthTransaction(): never {
  return fail(
    "LIVE_UNAVAILABLE",
    "Fixture drafts cannot be broadcast. For a live testnet spend, use const { tx } = signStealthSpend(client, options), then await client.sendTransaction(tx).",
  );
}
