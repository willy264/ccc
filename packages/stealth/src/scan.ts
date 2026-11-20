import type { ccc } from "@ckb-ccc/core";
import { assertCapacity } from "./capacity.js";
import { fail, StealthError } from "./errors.js";
import { addTweak, publicKey, scalar, tweak } from "./internal/curve.js";
import { bytes, hex } from "./internal/encoding.js";
import { addressFor, assertLock, pubkeyHash } from "./internal/lock.js";
import { stealthScriptInfoForPrefix } from "./predefined/index.js";
import type { DetectedPayment, FixturePayment, Hex } from "./types.js";

export interface ScannedStealthCell {
  cell: ccc.Cell;
  ephemeralPublicKey: Hex;
  oneTimePublicKey: Hex;
}

function matchLock(lock: ccc.Script, view: Uint8Array, spend: Uint8Array) {
  const args = bytes(lock.args, 53, "Stealth lock arguments");
  const ephemeralPublicKey = hex(args.slice(0, 33));
  const ephemeral = publicKey(ephemeralPublicKey, "Ephemeral public key");
  const derived = addTweak(spend, tweak(ephemeral, view));
  if (pubkeyHash(derived) !== hex(args.slice(33)).slice(2)) {
    return undefined;
  }
  return { ephemeralPublicKey, oneTimePublicKey: hex(derived) };
}

/** Scan plain CKB cells using CCC's paginated prefix iterator. */
export async function scanStealthCells(
  client: Pick<ccc.Client, "addressPrefix" | "findCells">,
  { viewKey, spendPublicKey }: { viewKey: string; spendPublicKey: string },
): Promise<ScannedStealthCell[]> {
  const { stealthLock } = stealthScriptInfoForPrefix(client.addressPrefix);
  const spend = publicKey(spendPublicKey, "Spend public key");
  const view = scalar(viewKey, "View key");
  const seen = new Set<string>();
  const matches: ScannedStealthCell[] = [];
  try {
    for await (const cell of client.findCells({
      script: { ...stealthLock, args: "0x" },
      scriptType: "lock",
      scriptSearchMode: "prefix",
      withData: true,
    })) {
      const id = `${cell.outPoint.txHash}:${cell.outPoint.index}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const { lock, type, capacity } = cell.cellOutput;
      if (
        type ||
        cell.outputData !== "0x" ||
        lock.codeHash !== stealthLock.codeHash ||
        lock.hashType !== stealthLock.hashType
      ) {
        continue;
      }
      try {
        assertCapacity(capacity, lock);
        const match = matchLock(lock, view, spend);
        if (match) {
          matches.push({ cell, ...match });
        }
      } catch (error) {
        if (!(error instanceof StealthError)) {
          throw error;
        }
      }
    }
    return matches;
  } finally {
    view.fill(0);
  }
}

/** View-only matching over supplied fixtures; does not fetch an indexer or claim chain state. */
export function scanStealthPayments(
  records: readonly FixturePayment[],
  viewKey: string,
  spendPublicKey: string,
  deployment = stealthScriptInfoForPrefix(),
): { matches: DetectedPayment[]; rejected: number } {
  const view = scalar(viewKey, "View key");
  const spend = publicKey(spendPublicKey, "Spend public key");
  const matches: DetectedPayment[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const record of records) {
    try {
      if (
        record.source !== "SIMULATED" ||
        record.outputData !== "0x" ||
        seen.has(record.id)
      ) {
        fail("INVALID_FIXTURE", "Expected a unique empty-data local fixture.");
      }
      seen.add(record.id);
      const lock = assertLock(record.lock, deployment);
      assertCapacity(record.capacity, lock);
      const match = matchLock(lock, view, spend);
      if (match) {
        matches.push({
          ...record,
          lock: lock.clone(),
          oneTimePublicKey: match.oneTimePublicKey,
          address: addressFor(lock, deployment.addressPrefix),
        });
      }
    } catch {
      rejected++;
    }
  }
  view.fill(0);
  return { matches, rejected };
}
