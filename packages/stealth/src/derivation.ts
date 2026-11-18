import { ccc } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { assertCapacity } from "./capacity.js";
import { derivePayment } from "./internal/derive-payment.js";
import { stealthScriptInfoForPrefix } from "./predefined/index.js";
import type { StealthPayment } from "./types.js";

/**
 * Derive the actual ECDH one-time lock locally using a fresh CSPRNG scalar.
 * Address encoding does not verify deployment or establish chain settlement.
 */
export function deriveStealthPayment(
  client: Pick<ccc.Client, "addressPrefix">,
  identifier: string,
): Pick<StealthPayment, "lock" | "ephemeralPublicKey"> {
  const deployment = stealthScriptInfoForPrefix(client.addressPrefix);
  const { lock, ephemeralPublicKey } = derivePayment(
    identifier,
    secp256k1.utils.randomSecretKey(),
    deployment,
  );
  return { lock, ephemeralPublicKey };
}

/** Append an empty-data stealth output. Capacity is in shannons. */
export function addStealthOutput(
  tx: ccc.Transaction,
  client: Pick<ccc.Client, "addressPrefix">,
  identifier: string,
  capacity: bigint,
): Pick<StealthPayment, "lock" | "ephemeralPublicKey"> {
  const payment = deriveStealthPayment(client, identifier);
  assertCapacity(capacity, payment.lock);
  tx.addOutput({ capacity, lock: payment.lock }, "0x");
  return payment;
}
