import { bech32m } from "bech32";
import { fail } from "../errors.js";
import { bytes, hex } from "../internal/encoding.js";
import {
  decodeStealthMetaAddress,
  encodeStealthMetaAddress,
} from "../meta-address.js";
import type { Hex, StealthMetaAddress } from "../types.js";

const VERSION = 0x01;
const PREFIXES = { testnet: "ckts", mainnet: "ckbs" } as const;
export type StealthIdentifierNetwork = keyof typeof PREFIXES;

/** Recognize the reserved namespace even when the payload is malformed. */
export function hasStealthIdentifierPrefix(value: string): boolean {
  const address = value.toLowerCase();
  return Object.values(PREFIXES).some((prefix) =>
    address.startsWith(`${prefix}1`),
  );
}

export function encodeExperimentalStealthIdentifier(
  metaAddress: StealthMetaAddress | string,
  network: StealthIdentifierNetwork,
): string {
  const raw =
    typeof metaAddress === "string"
      ? bytes(
          encodeStealthMetaAddress(decodeStealthMetaAddress(metaAddress)),
          66,
          "Meta-address",
        )
      : bytes(encodeStealthMetaAddress(metaAddress), 66, "Meta-address");
  return bech32m.encode(
    PREFIXES[network],
    bech32m.toWords(Uint8Array.from([VERSION, ...raw])),
    200,
  );
}

export function decodeExperimentalStealthIdentifier(
  value: string,
  expectedNetwork?: StealthIdentifierNetwork,
): { network: StealthIdentifierNetwork; metaAddress: Hex } {
  let prefix: string;
  let payload: Uint8Array;
  try {
    const decoded = bech32m.decode(value, 200);
    prefix = decoded.prefix;
    payload = Uint8Array.from(bech32m.fromWords(decoded.words));
  } catch {
    fail(
      "INVALID_IDENTIFIER_CHECKSUM",
      "Invalid stealth identifier checksum or encoding.",
    );
  }
  const network = Object.entries(PREFIXES).find(
    ([, candidate]) => candidate === prefix,
  )?.[0] as StealthIdentifierNetwork | undefined;
  if (!network) {
    fail(
      "INVALID_IDENTIFIER_NETWORK",
      `Unsupported stealth identifier prefix: ${prefix}`,
    );
  }
  if (expectedNetwork && expectedNetwork !== network) {
    fail(
      "NETWORK_MISMATCH",
      `Stealth identifier network is ${network}, expected ${expectedNetwork}.`,
    );
  }
  if (payload[0] === 0x00) {
    fail(
      "UNSUPPORTED_IDENTIFIER_VERSION",
      "Stealth identifier version 0x00 is reserved and never valid.",
    );
  }
  if (payload[0] !== VERSION || payload.length !== 67) {
    fail(
      "UNSUPPORTED_IDENTIFIER_VERSION",
      "Unsupported stealth identifier version or payload length.",
    );
  }
  const meta = hex(payload.slice(1));
  decodeStealthMetaAddress(meta);
  return { network, metaAddress: meta };
}
