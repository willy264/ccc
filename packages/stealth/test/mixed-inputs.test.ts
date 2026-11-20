import { ccc } from "@ckb-ccc/core";
import { expect, it, vi } from "vitest";
import {
  deriveStealthPayment,
  signStealthSpend,
  StealthError,
} from "../src/index.js";
import vector from "./vector.json";

vi.mock("@ckb-ccc/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@ckb-ccc/core")>();
  return {
    ...core,
    ccc: {
      ...core.ccc,
      signMessageSecp256k1: vi.fn(core.ccc.signMessageSecp256k1),
    },
  };
});

it("rejects an ordinary secp256k1 input before signing any stealth input", async () => {
  const client = ccc.ClientPublicTestnet.new({
    transport: {
      request: async () => {
        throw new Error("Unexpected RPC request");
      },
    },
  });
  const identifier = vector.viewPublicKey + vector.spendPublicKey.slice(2);
  const stealth = deriveStealthPayment(client, identifier).lock;
  const ordinary = await ccc.Script.fromKnownScript(
    client,
    ccc.KnownScript.Secp256k1Blake160,
    ccc.hashCkbShort(vector.spendPublicKey),
  );
  const inputs = [stealth, ordinary].map((lock, index) =>
    ccc.Cell.from({
      outPoint: { txHash: ccc.hexFrom(new Uint8Array(32)), index },
      cellOutput: { lock, capacity: ccc.fixedPointFrom(200) },
      outputData: "0x",
    }),
  );
  expect(() =>
    signStealthSpend(client, { ...vector, inputs, feeRate: 1000n }),
  ).toThrow(
    expect.objectContaining({ constructor: StealthError, code: "WRONG_LOCK" }),
  );
  expect(ccc.signMessageSecp256k1).not.toHaveBeenCalled();
});
