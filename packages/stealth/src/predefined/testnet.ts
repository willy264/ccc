import type { Hex } from "../types.js";
import type { StealthScriptInfo } from "./types.js";

export const TESTNET_STEALTH = Object.freeze({
  network: "testnet",
  stealthLock: {
    codeHash: "0x0dc965b5bfb6db2759275ad7d92ee502e10955cca789d001af03e3576cfe3f1c" as Hex,
    hashType: "type",
  },
  ckbAuth: {
    codeHash: "0x0915983bb31584df4566e0946fd00ef1e9a75ad37a39ce70fec9b5cbf3b87021" as Hex,
    hashType: "type",
  },
  cellDeps: [
    {
      cellDep: {
        outPoint: {
          txHash: "0x305a174d8af95368aac1768bf7b1fe7398a6cb6b04808fbbc685300403318428",
          index: 0,
        },
        depType: "code",
      },
    },
    {
      cellDep: {
        outPoint: {
          txHash: "0xa0e99b29fd154385815142b76668d5f4ecf30ae85bc2942bd21e9e51b9066f97",
          index: 0,
        },
        depType: "code",
      },
    },
  ] as const,
} as const satisfies StealthScriptInfo);
