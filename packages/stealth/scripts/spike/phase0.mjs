import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  Address,
  ClientPublicTestnet,
  Transaction,
  WitnessArgs,
  bytesFrom,
  bytesConcat,
  fixedPointFrom,
  fixedPointToString,
  hashCkb,
  hashCkbShort,
  recoverMessageSecp256k1,
  Script,
  signMessageSecp256k1,
  verifyMessageSecp256k1,
} from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { predefined } from "@ckb-ccc/stealth";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
const envPath = path.join(root, ".env");
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function loadEnv() {
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function saveEnv(values) {
  const existing = loadEnv();
  const merged = { ...existing, ...values };
  fs.writeFileSync(
    envPath,
    `${Object.entries(merged)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );
}

function hex(bytes) {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function bytes(value) {
  return bytesFrom(value);
}

function sha256(value) {
  return new Uint8Array(createHash("sha256").update(value).digest());
}

function randomSecretKey() {
  while (true) {
    const candidate = new Uint8Array(randomBytes(32));
    const scalar = BigInt(`0x${Buffer.from(candidate).toString("hex")}`);
    if (scalar > 0n && scalar < SECP256K1_ORDER) return candidate;
  }
}

function derivePayment(viewPublicKey, spendPublicKey, ephemeralSecretKey) {
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecretKey, true);
  const sharedPoint = secp256k1.getSharedSecret(ephemeralSecretKey, viewPublicKey, true);
  const tweak = sha256(sha256(sharedPoint));
  const tweakScalar = BigInt(`0x${Buffer.from(tweak).toString("hex")}`) % SECP256K1_ORDER;
  const spendPoint = secp256k1.Point.fromHex(Buffer.from(spendPublicKey).toString("hex"));
  const oneTimePublicKey = spendPoint
    .add(secp256k1.Point.BASE.multiply(tweakScalar))
    .toBytes(true);
  return {
    ephemeralPublicKey,
    oneTimePublicKey,
    lockArgs: bytesConcat(ephemeralPublicKey, bytes(hashCkbShort(oneTimePublicKey))),
  };
}

function scalarHex(value) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

async function probe(client, deployment) {
  const [stealthCell, authCell] = await Promise.all([
    client.getCellLive(deployment.cellDeps[0].cellDep.outPoint, true, false),
    client.getCellLive(deployment.cellDeps[1].cellDep.outPoint, true, false),
  ]);
  if (!stealthCell) throw new Error("stealth-lock cell dep is not live");
  if (!authCell) throw new Error("ckb-auth cell dep is not live");

  const stealthType = stealthCell.cellOutput.type;
  const stealthTypeHash = stealthType ? Script.from(stealthType).hash() : undefined;
  const stealthTypeMatches = stealthTypeHash === deployment.stealthLock.codeHash;
  const authType = authCell.cellOutput.type;
  const authDataHash = hashCkb(authCell.outputData);
  console.log(JSON.stringify({
    phase: "0.1",
    network: deployment.network,
    stealthDep: {
      live: true,
      outputDataHash: hashCkb(stealthCell.outputData),
      outputDataBytes: bytes(stealthCell.outputData).length,
      typeScript: stealthType ?? null,
      typeScriptHash: stealthTypeHash ?? null,
      codeHashMatches: stealthTypeMatches,
    },
    ckbAuthDep: {
      live: true,
      dataHash: authDataHash,
      typeScript: authType ?? null,
      typeScriptHash: authType ? Script.from(authType).hash() : null,
    },
  }, null, 2));

  const result = [];
  const key = {
    script: { ...deployment.stealthLock, args: "0x" },
    scriptType: "lock",
    scriptSearchMode: "prefix",
    withData: false,
  };
  for await (const cell of client.findCells(key, "asc", 100)) result.push(cell);
  console.log(JSON.stringify({ phase: "0.2", prefixSearch: "passed", count: result.length }));
}

async function main() {
  // Force CCC's HTTP transport for this spike; the public WebSocket endpoint is
  // optional and can fail independently of the JSON-RPC node.
  const owner = ClientPublicTestnet.open({ urls: ["https://testnet.ckb.dev/"] });
  const client = owner.value;
  try {
    const deployment = predefined.stealthScriptInfoForPrefix(client.addressPrefix);
    await probe(client, deployment);
    const env = loadEnv();
    let viewSecret = env.STEALTH_VIEW_SECRET;
    let spendSecret = env.STEALTH_SPEND_SECRET;
    if (!viewSecret || !spendSecret) {
      viewSecret = hex(randomSecretKey());
      spendSecret = hex(randomSecretKey());
      saveEnv({ STEALTH_VIEW_SECRET: viewSecret, STEALTH_SPEND_SECRET: spendSecret });
      console.log("Generated fresh recipient keys and stored them in the ignored .env.");
    }

    const viewPublicKey = secp256k1.getPublicKey(bytes(viewSecret), true);
    const spendPublicKey = secp256k1.getPublicKey(bytes(spendSecret), true);
    const metaAddress = hex(bytesConcat(viewPublicKey, spendPublicKey));
    const ephemeralSecret = env.STEALTH_EPHEMERAL_SECRET
      ? bytes(env.STEALTH_EPHEMERAL_SECRET)
      : randomSecretKey();
    if (!env.STEALTH_EPHEMERAL_SECRET) {
      saveEnv({ STEALTH_EPHEMERAL_SECRET: hex(ephemeralSecret) });
    }
    const payment = derivePayment(viewPublicKey, spendPublicKey, ephemeralSecret);
    const lock = Script.from({
      ...deployment.stealthLock,
      args: hex(payment.lockArgs),
    });
    const stealthAddress = Address.fromScript(lock, client).toString();
    saveEnv({ STEALTH_META_ADDRESS: metaAddress, STEALTH_EPHEMERAL_PUBLIC_KEY: hex(payment.ephemeralPublicKey) });
    console.log(JSON.stringify({
      phase: "0.3",
      metaAddress,
      ephemeralPublicKey: hex(payment.ephemeralPublicKey),
      stealthLock: lock,
      stealthAddress,
      minimumCapacity: "94 CKB",
    }, null, 2));

    const fundedTx = env.STEALTH_FUND_TX;
    const fundedIndex = env.STEALTH_FUND_INDEX;
    if (!fundedTx || fundedIndex === undefined) {
      console.log("Fund the printed stealthAddress with at least 200 CKB, then set STEALTH_FUND_TX and STEALTH_FUND_INDEX in .env.");
      return;
    }
    const inputCell = await client.getCellLive({ txHash: fundedTx, index: Number(fundedIndex) }, true, false);
    if (!inputCell) {
      console.log("The configured funding outpoint is no longer live. Fund the corrected stealthAddress and replace STEALTH_FUND_TX/STEALTH_FUND_INDEX in .env.");
      return;
    }
    if (!Script.from(inputCell.cellOutput.lock).eq(lock)) throw new Error("funded cell lock does not match this run's stealth lock");
    if (inputCell.cellOutput.capacity < fixedPointFrom(94)) throw new Error("funded stealth cell is below 94 CKB");

    const nextEphemeralSecret = randomSecretKey();
    const nextPayment = derivePayment(viewPublicKey, spendPublicKey, nextEphemeralSecret);
    const nextLock = Script.from({ ...deployment.stealthLock, args: hex(nextPayment.lockArgs) });
    const fee = fixedPointFrom("0.001");
    const outputCapacity = inputCell.cellOutput.capacity - fee;
    const tx = Transaction.from({
      cellDeps: deployment.cellDeps.map(({ cellDep }) => cellDep),
      inputs: [{ previousOutput: inputCell.outPoint }],
      outputs: [{ capacity: outputCapacity, lock: nextLock }],
      witnesses: [WitnessArgs.from({ lock: `0x${"00".repeat(65)}` }).toBytes()],
    });
    const spendSecretScalar = (
      BigInt(bytes(spendSecret).reduce((acc, byte) => `${acc}${byte.toString(16).padStart(2, "0")}`, "0x")) +
        BigInt(`0x${Buffer.from(sha256(sha256(secp256k1.getSharedSecret(bytes(viewSecret), bytes(payment.ephemeralPublicKey), true)))).toString("hex")}`)
    ) % SECP256K1_ORDER;
    const signature = signMessageSecp256k1(tx.hash(), scalarHex(spendSecretScalar));
    const recovered = recoverMessageSecp256k1(tx.hash(), signature);
    const expectedOneTimePublicKey = secp256k1.Point.BASE.multiply(spendSecretScalar).toBytes(true);
    const expectedLockHash = hashCkbShort(expectedOneTimePublicKey);
    const actualLockHash = `0x${lock.args.slice(68)}`;
    const verified = verifyMessageSecp256k1(tx.hash(), signature, hex(expectedOneTimePublicKey)) &&
      expectedLockHash === actualLockHash;
    const senderShared = sha256(secp256k1.getSharedSecret(ephemeralSecret, viewPublicKey, true));
    const recipientShared = sha256(secp256k1.getSharedSecret(bytes(viewSecret), bytes(payment.ephemeralPublicKey), true));
    console.log(JSON.stringify({
      phase: "0.4",
      rawTxHash: tx.hash(),
      signatureVerifiedLocally: verified,
      recoveredPublicKey: recovered,
      expectedOneTimePublicKey: hex(expectedOneTimePublicKey),
      derivedOneTimePublicKey: hex(payment.oneTimePublicKey),
      sharedSecretMatches: hex(senderShared) === hex(recipientShared),
      lockHashMatches: expectedLockHash === actualLockHash,
      expectedLockHash,
      actualLockHash,
    }, null, 2));
    if (!verified) throw new Error("local stealth signature verification failed");
    tx.setWitnessArgs(0, { lock: signature });
    const txHash = await client.sendTransaction(tx);
    const confirmed = await client.waitTransaction(txHash, 1, 120000, 3000);
    let changeFoundByPrefixScan = false;
    for await (const cell of client.findCells({
      script: { ...deployment.stealthLock, args: "0x" },
      scriptType: "lock",
      scriptSearchMode: "prefix",
      withData: false,
    }, "asc", 100)) {
      if (Script.from(cell.cellOutput.lock).eq(nextLock)) {
        changeFoundByPrefixScan = true;
        break;
      }
    }
    console.log(JSON.stringify({
      phase: "0.4",
      broadcastTxHash: txHash,
      confirmed: Boolean(confirmed),
      changeFoundByPrefixScan,
      changeLock: nextLock,
    }, null, 2));
  } finally {
    await owner.dispose();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
