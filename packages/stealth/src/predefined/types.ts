import type { ccc } from "@ckb-ccc/core";
import type { Hex } from "../types.js";

export interface StealthScriptInfo {
  readonly network: "testnet" | "mainnet";
  readonly stealthLock: {
    readonly codeHash: Hex;
    readonly hashType: "type";
  };
  readonly ckbAuth: {
    readonly codeHash: Hex;
    readonly hashType: "type";
  };
  readonly cellDeps: readonly ccc.CellDepInfoLike[];
}
