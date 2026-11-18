import type { ccc } from "@ckb-ccc/core";
import { deriveStealthPayment } from "../derivation.js";
import { stealthScriptInfoForPrefix } from "../predefined/index.js";
import {
  decodeExperimentalStealthIdentifier,
  hasStealthIdentifierPrefix,
} from "./identifier.js";

/** Pay-only resolver. Each stealth identifier resolution derives a fresh lock. */
export function createStealthAddressResolver({
  fallback,
}: { fallback?: ccc.AddressResolver } = {}): ccc.AddressResolver {
  return {
    shouldResolve(address) {
      return (
        hasStealthIdentifierPrefix(address) ||
        (fallback?.shouldResolve(address) ?? false)
      );
    },
    async resolve(address, client) {
      if (hasStealthIdentifierPrefix(address)) {
        const { network } = stealthScriptInfoForPrefix(client.addressPrefix);
        const { metaAddress } = decodeExperimentalStealthIdentifier(
          address,
          network,
        );
        return deriveStealthPayment(client, metaAddress).lock;
      }
      if (fallback?.shouldResolve(address)) {
        return fallback.resolve(address, client);
      }
      return undefined;
    },
  };
}
