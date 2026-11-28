import { ccc } from "@ckb-ccc/core";
import {
  AddressFormat,
  addressPayloadFromString,
} from "@ckb-ccc/core/advanced";
import { parseCapacity } from "@ckb-ccc/stealth";

/** Full-format addresses only: no name resolution, client, signer or RPC. */
export function buildNormalDraft(address: string, amount: string) {
  const { prefix, format, payload } = addressPayloadFromString(address.trim());
  if (
    prefix !== "ckt" ||
    format !== AddressFormat.Full ||
    payload.length < 33
  ) {
    throw new Error("Enter a full-format CKB testnet address (ckt1...).");
  }
  const lock = ccc.Script.from({
    codeHash: payload.slice(0, 32),
    hashType: ccc.hashTypeFromBytes(payload.slice(32, 33)),
    args: payload.slice(33),
  });
  const capacity = parseCapacity(amount);
  const output = ccc.CellOutput.from({ lock, capacity });
  if (capacity < BigInt(output.occupiedSize) * BigInt(100_000_000)) {
    throw new Error("Amount is below this output's occupied capacity.");
  }
  return ccc.Transaction.from({ outputs: [output], outputsData: ["0x"] });
}

export function describeDraft(transaction: ccc.Transaction) {
  return JSON.stringify(
    {
      outputs: transaction.outputs,
      outputsData: transaction.outputsData,
      inputs: [],
      witnesses: [],
    },
    (_key, value) =>
      typeof value === "bigint" ? `0x${value.toString(16)}` : value,
    2,
  );
}

export function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Unable to prepare preview";
}
