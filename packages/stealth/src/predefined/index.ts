import { fail } from "../errors.js";
import { TESTNET_STEALTH } from "./testnet.js";
import type { StealthScriptInfo } from "./types.js";

export { TESTNET_STEALTH } from "./testnet.js";
export type { StealthScriptInfo } from "./types.js";

export function stealthScriptInfoForPrefix(
  addressPrefix: string,
): StealthScriptInfo {
  if (addressPrefix === "ckt") {
    return TESTNET_STEALTH;
  }
  if (addressPrefix === "ckb") {
    fail(
      "NOT_DEPLOYED",
      "Obscell stealth-lock is not deployed on CKB mainnet.",
    );
  }
  fail(
    "UNSUPPORTED_NETWORK",
    `Unsupported CKB address prefix: ${addressPrefix}`,
  );
}
