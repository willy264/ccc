import { TESTNET_STEALTH } from "./predefined/index.js";

/** @deprecated Use `predefined.TESTNET_STEALTH` in new code. */
export const TESTNET_STEALTH_LOCK = Object.freeze({
  ...TESTNET_STEALTH.stealthLock,
  network: TESTNET_STEALTH.network,
});
