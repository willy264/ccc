import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { ccc } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";

function recipient() {
  const viewKey = process.env.STEALTH_VIEW_SECRET;
  const spendKey = process.env.STEALTH_SPEND_SECRET;
  assert(viewKey && spendKey, "Configure the throwaway view and spend secrets.");
  const publicKey = (key) => ccc.hexFrom(secp256k1.getPublicKey(ccc.bytesFrom(key)));
  return { viewKey, spendKey, viewPublicKey: publicKey(viewKey), spendPublicKey: publicKey(spendKey) };
}

export async function runLifecycle(stealth, command, outpoint, log = console.log) {
  const keys = recipient();
  const owner = ccc.ClientPublicTestnet.open({ urls: ["https://testnet.ckb.dev/"] });
  const client = owner.value;
  try {
    if (command === "prepare") {
      const identifier = stealth.encodeStealthMetaAddress(keys);
      const { lock } = stealth.deriveStealthPayment(client, identifier);
      const address = ccc.Address.from({ prefix: client.addressPrefix, script: lock }).toString();
      log(address);
      return address;
    }

    assert(command === "spend" || command === "resume", "Use prepare, spend, or resume.");
    assert(/^0x[0-9a-f]{64}:[0-9]+$/.test(outpoint ?? ""), "Supply a transaction hash and decimal output index.");
    const [hash, index] = outpoint.split(":");
    const scan = async (txHash, outputIndex) => {
      const matches = await stealth.scanStealthCells(client, keys);
      return matches.find(({ cell }) => cell.outPoint.txHash === txHash && cell.outPoint.index === outputIndex);
    };
    let spendHash = hash;
    let changeIndex = BigInt(index);
    if (command === "spend") {
      const funding = await client.waitTransaction(hash);
      assert.equal(funding?.status, "committed");
      const detected = await scan(hash, BigInt(index));
      assert(detected, "The funding outpoint is missing from the stealth scan.");
      const { tx } = stealth.signStealthSpend(client, {
        inputs: [detected.cell],
        viewKey: keys.viewKey,
        spendKey: keys.spendKey,
        feeRate: 1000n,
      });
      assert.notEqual(tx.outputs[0].lock.args.slice(0, 68), detected.ephemeralPublicKey);
      spendHash = tx.hash();
      changeIndex = 0n;
      log(`Funding outpoint ${outpoint}`);
      log(`Spend hash ${spendHash}`);
      assert.equal(await client.sendTransaction(tx), spendHash);
    }
    const result = await client.waitTransaction(spendHash);
    assert.equal(result?.status, "committed");
    for (let attempt = 0; attempt < 6; attempt++) {
      const change = await scan(spendHash, changeIndex);
      if (change) {
        log(`Detected change ${spendHash}:${changeIndex}`);
        return { spendHash, changeIndex };
      }
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("The committed change outpoint did not appear in the scan.");
  } finally {
    await owner.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stealth = await import("@ckb-ccc/stealth");
  await runLifecycle(stealth, process.argv[2], process.argv[3]);
}
