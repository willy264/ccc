import { describe, expect, it } from "vitest";
import { decodeStealthMetaAddress, encodeStealthMetaAddress } from "../src/meta-address.js";
import { StealthError } from "../src/errors.js";
import { decodeExperimentalStealthIdentifier, encodeExperimentalStealthIdentifier } from "../src/experimental/index.js";
import { stealthScriptInfoForPrefix } from "../src/predefined/index.js";

const metaAddress = {
  viewPublicKey: "0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" as const,
  spendPublicKey: "0x02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5" as const,
};

describe("foundation", () => {
  it("round-trips the legacy meta-address and validates points", () => {
    const encoded = encodeStealthMetaAddress(metaAddress);
    expect(encoded).toBe(`0x${metaAddress.viewPublicKey.slice(2)}${metaAddress.spendPublicKey.slice(2)}`);
    expect(decodeStealthMetaAddress(encoded)).toEqual(metaAddress);
    expect(() => decodeStealthMetaAddress(`0x${"02".repeat(66)}`)).toThrow(StealthError);
  });

  it("round-trips the experimental bech32m identifier", () => {
    const encoded = encodeExperimentalStealthIdentifier(metaAddress, "testnet");
    expect(encoded.startsWith("ckts1")).toBe(true);
    expect(decodeExperimentalStealthIdentifier(encoded, "testnet")).toEqual({
      network: "testnet",
      metaAddress: encodeStealthMetaAddress(metaAddress),
    });
    expect(() => decodeExperimentalStealthIdentifier(encoded, "mainnet")).toThrowError(/network/i);
  });

  it("selects testnet deployment metadata and rejects mainnet", () => {
    expect(stealthScriptInfoForPrefix("ckt").network).toBe("testnet");
    expect(() => stealthScriptInfoForPrefix("ckb")).toThrowError(/not deployed/i);
  });
});
