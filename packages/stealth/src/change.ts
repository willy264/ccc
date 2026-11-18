import { secp256k1 } from "@noble/curves/secp256k1.js";
import { derivePayment } from "./internal/derive-payment.js";
import type { StealthPayment } from "./types.js";

/** Generate fresh CSPRNG-backed change; never reuses the payment's ephemeral key. */
export function deriveFreshChange(metaAddress: string): StealthPayment {
  return derivePayment(metaAddress, secp256k1.utils.randomSecretKey());
}
