import { ccc } from "@ckb-ccc/core";
import { bech32m } from "bech32";
import { expect, it, vi } from "vitest";
import {
  createStealthAddressResolver,
  encodeExperimentalStealthIdentifier,
} from "../src/experimental.js";
import { deriveSpendKey, stealthScriptInfoForPrefix } from "../src/index.js";
import vector from "./vector.json";

const transport = {
  request: async () => {
    throw new Error("Unexpected RPC request");
  },
};
const raw = vector.viewPublicKey + vector.spendPublicKey.slice(2);
const identifier = encodeExperimentalStealthIdentifier(raw, "testnet");

it("resolves a fresh recipient-owned payment lock on each CCC lookup", async () => {
  const client = ccc.ClientPublicTestnet.new({
    transport,
    addressResolver: createStealthAddressResolver(),
  });
  const first = await ccc.Address.fromString(identifier, client);
  const second = await ccc.Address.fromString(identifier.toUpperCase(), client);
  expect(first.script.args.slice(0, 68)).not.toBe(
    second.script.args.slice(0, 68),
  );
  for (const { script } of [first, second]) {
    expect(script.codeHash).toBe(
      stealthScriptInfoForPrefix(client.addressPrefix).stealthLock.codeHash,
    );
    expect(() =>
      deriveSpendKey(script, vector.viewKey, vector.spendKey),
    ).not.toThrow();
  }
});

it("delegates only names claimed by the fallback and preserves ordinary CCC addresses", async () => {
  const script = {
    ...stealthScriptInfoForPrefix().stealthLock,
    args: vector.args,
  };
  const fallback = {
    shouldResolve: vi.fn((name: string) => name.endsWith(".example")),
    resolve: vi.fn(async (name: string) =>
      name === "alice.example" ? script : undefined,
    ),
  };
  const resolver = createStealthAddressResolver({ fallback });
  const client = ccc.ClientPublicTestnet.new({
    transport,
    addressResolver: resolver,
  });
  const address = ccc.Address.fromScript(script, client).toString();
  expect((await ccc.Address.fromString(address, client)).toString()).toBe(
    address,
  );
  expect(fallback.shouldResolve).not.toHaveBeenCalled();
  expect(
    (await ccc.Address.fromString("alice.example", client)).toString(),
  ).toBe(address);
  expect(fallback.resolve).toHaveBeenCalledWith("alice.example", client);
  await expect(
    ccc.Address.fromString("absent.example", client),
  ).rejects.toThrow(/not found/);
  expect(resolver.shouldResolve(raw)).toBe(false);
  expect(await resolver.resolve(raw, client)).toBeUndefined();
  expect(fallback.resolve).toHaveBeenCalledTimes(2);
});

it("rejects malformed and wrong-network identifiers without invoking the fallback", async () => {
  const fallback = { shouldResolve: vi.fn(() => true), resolve: vi.fn() };
  const resolver = createStealthAddressResolver({ fallback });
  const client = ccc.ClientPublicTestnet.new({
    transport,
    addressResolver: resolver,
  });
  const mainnet = encodeExperimentalStealthIdentifier(raw, "mainnet");
  await expect(ccc.Address.fromString(mainnet, client)).rejects.toMatchObject({
    code: "NETWORK_MISMATCH",
  });
  for (const invalid of ["ckts1bad", bech32m.encode("ckts", [1])]) {
    await expect(ccc.Address.fromString(invalid, client)).rejects.toMatchObject(
      { code: "INVALID_IDENTIFIER_CHECKSUM" },
    );
  }
  const mainnetClient = ccc.ClientPublicMainnet.new({
    transport,
    addressResolver: resolver,
  });
  await expect(
    ccc.Address.fromString(mainnet, mainnetClient),
  ).rejects.toMatchObject({ code: "NOT_DEPLOYED" });
  expect(fallback.shouldResolve).not.toHaveBeenCalled();
  expect(fallback.resolve).not.toHaveBeenCalled();
});
