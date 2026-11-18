import { ccc } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { TESTNET_STEALTH } from "../predefined/index.js";
import { decodeStealthMetaAddress, encodeStealthMetaAddress } from "../meta-address.js";
import type { StealthPayment } from "../types.js";
import { addTweak, publicKey, tweak } from "./curve.js";
import { bytes, hex } from "./encoding.js";
import { addressFor, pubkeyHash } from "./lock.js";

/** Shared primitive. Only the testing entry point accepts a caller-supplied scalar. */
export function derivePayment(metaAddress: string, ephemeral: Uint8Array): StealthPayment {
  const decoded = decodeStealthMetaAddress(metaAddress);
  const ephemeralPublicKey = hex(secp256k1.getPublicKey(ephemeral, true));
  const oneTimePublicKey = hex(addTweak(
    publicKey(decoded.spendPublicKey, "Spend public key"),
    tweak(publicKey(decoded.viewPublicKey, "View public key"), ephemeral),
  ));
  ephemeral.fill(0);
  const lock = ccc.Script.from({
    codeHash: TESTNET_STEALTH.stealthLock.codeHash,
    hashType: TESTNET_STEALTH.stealthLock.hashType,
    args: `${ephemeralPublicKey}${pubkeyHash(bytes(oneTimePublicKey, 33, "One-time public key"))}`,
  });
  return { metaAddress: encodeStealthMetaAddress(decoded), ephemeralPublicKey, oneTimePublicKey, lock, address: addressFor(lock) };
}
