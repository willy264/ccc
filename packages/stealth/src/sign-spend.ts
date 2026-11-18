import { ccc } from "@ckb-ccc/core";
import { assertCapacity } from "./capacity.js";
import { addStealthOutput, deriveStealthPayment } from "./derivation.js";
import { fail } from "./errors.js";
import { assertLock, pubkeyHash } from "./internal/lock.js";
import { encodeStealthMetaAddress } from "./meta-address.js";
import { stealthScriptInfoForPrefix } from "./predefined/index.js";
import { deriveSpendKey } from "./spend.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";

export interface StealthSpendOptions {
  inputs: readonly ccc.Cell[];
  viewKey: string;
  spendKey: string;
  feeRate: bigint;
  /** Optional fixed payment. Omit to sweep the inputs to fresh self change. */
  payment?: { identifier: string; capacity: bigint };
}

/** Build and verify a signed Obscell transaction locally. Fee rate is shannons per kB. */
export function signStealthSpend(
  client: Pick<ccc.Client, "addressPrefix">,
  { inputs, viewKey, spendKey, feeRate, payment }: StealthSpendOptions,
) {
  const { cellDeps } = stealthScriptInfoForPrefix(client.addressPrefix);
  if (inputs.length === 0) fail("MISSING_INPUTS", "Select at least one stealth cell.");
  if (typeof feeRate !== "bigint" || feeRate <= 0n) {
    fail("INVALID_FEE_RATE", "Use a positive fee rate in shannons per kB.");
  }

  const tx = ccc.Transaction.from({ cellDeps: cellDeps.map(({ cellDep }) => cellDep) });
  const seen = new Set<string>();
  let total = 0n;
  for (const cell of inputs) {
    const id = `${cell.outPoint.txHash}:${cell.outPoint.index}`;
    if (seen.has(id)) fail("DUPLICATE_INPUT", "Each selected outpoint must be unique.");
    seen.add(id);
    const { lock, type, capacity } = cell.cellOutput;
    if (type || cell.outputData !== "0x") {
      fail("UNSUPPORTED_INPUT", "Stealth spends require plain CKB cells.");
    }
    assertCapacity(capacity, assertLock(lock));
    total += capacity;
    tx.addInput(cell);
    tx.setWitnessArgs(tx.inputs.length - 1, { lock: `0x${"00".repeat(65)}` });
  }

  if (payment) addStealthOutput(tx, client, payment.identifier, payment.capacity);
  const remaining = total - (payment?.capacity ?? 0n);
  const feeWithoutChange = tx.estimateFee(feeRate);
  const recipient = encodeStealthMetaAddress({
    viewPublicKey: ccc.hexFrom(secp256k1.getPublicKey(ccc.bytesFrom(viewKey))),
    spendPublicKey: ccc.hexFrom(secp256k1.getPublicKey(ccc.bytesFrom(spendKey))),
  });
  const { lock: changeLock } = deriveStealthPayment(client, recipient);
  const withChange = tx.clone();
  withChange.addOutput({ lock: changeLock }, "0x");
  const change = remaining - withChange.estimateFee(feeRate);
  const minimumChange = BigInt(8 + changeLock.occupiedSize) * 100_000_000n;
  if (remaining < feeWithoutChange || (!payment && change < minimumChange)) {
    fail("INSUFFICIENT_CAPACITY", "Inputs cannot cover the outputs and estimated fee.");
  }

  let changeCapacity = 0n;
  let extraFee = 0n;
  if (change >= minimumChange) {
    assertCapacity(change, changeLock);
    tx.addOutput({ lock: changeLock, capacity: change }, "0x");
    changeCapacity = change;
  } else {
    extraFee = remaining - feeWithoutChange;
  }

  const hash = tx.hash();
  inputs.forEach(({ cellOutput: { lock } }, index) => {
    const key = ccc.bytesFrom(deriveSpendKey(lock, viewKey, spendKey));
    try {
      const signature = ccc.signMessageSecp256k1(hash, key);
      const recovered = ccc.recoverMessageSecp256k1(hash, signature);
      if (pubkeyHash(ccc.bytesFrom(recovered)) !== lock.args.slice(-40)) {
        fail("INVALID_SIGNATURE", "The recovered public key does not match the stealth lock.");
      }
      tx.setWitnessArgs(index, { lock: signature });
    } finally {
      key.fill(0);
    }
  });
  return { tx, fee: remaining - changeCapacity, changeCapacity, extraFee };
}
