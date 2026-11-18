# @ckb-ccc/stealth

Receive plain CKB on testnet using a reusable public identifier. Each payment creates a fresh Obscell lock. The recipient uses a private view key to find live outputs and a separate spend key to authorize a spend. [Recorded testnet funding, spend, and change](docs/testnet-lifecycle.md)

## Install from this fork

From the repository root, install the workspace dependencies and build the package and its dependencies.

```sh
pnpm install --frozen-lockfile
pnpm --filter "@ckb-ccc/stealth..." run build
```

In a consuming package in the same workspace, add both dependencies with `pnpm add "@ckb-ccc/core@workspace:*" "@ckb-ccc/stealth@workspace:*"`. The package requires CCC core 1.23.0 or later.

## Select the network

Use a CCC testnet client with an indexer that supports lock-prefix searches. The client’s `ckt` prefix selects the Obscell deployment and both spend dependencies. Mainnet has no deployment.

```ts
import { ccc } from "@ckb-ccc/core";

const owner = ccc.ClientPublicTestnet.open({
  urls: ["https://testnet.ckb.dev/"],
});
try {
  const client = owner.value;
  // Run the recipient operations below with this client.
} finally {
  await owner.dispose();
}
```

## Receive and send a payment

The recipient creates two independent secp256k1 key pairs and keeps both secrets locally. Pass their compressed 33-byte public keys, encoded as hex, to `encodeStealthMetaAddress({ viewPublicKey, spendPublicKey })` from `@ckb-ccc/stealth`. Share the returned identifier with the sender. This raw format carries the view public key first and the spend public key second. Select testnet explicitly because the raw format carries no network marker. [Identifier formats](docs/identifier-spec.md)

The sender supplies a funded, connected CCC testnet signer. Each plain stealth cell needs at least 94 CKB.

```ts
import { ccc } from "@ckb-ccc/core";
import { addStealthOutput } from "@ckb-ccc/stealth";

async function sendPayment(signer: ccc.Signer, recipientIdentifier: string) {
  const tx = ccc.Transaction.from({});
  addStealthOutput(
    tx,
    signer.client,
    recipientIdentifier,
    ccc.fixedPointFrom(200),
  );
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);
  return { txHash, index: 0n }; // The first output is the recipient's 200 CKB.
}
```

## Scan and spend

The recipient scans with the private view key and the public spend key. Supply the sender’s outpoint to select a particular payment from the results. Each scan performs one local ECDH operation per well-formed plain CKB candidate. A newly committed payment can take time to appear in the indexer. [Scanner behavior](docs/scanning.md)

```ts
import { ccc } from "@ckb-ccc/core";
import { scanStealthCells, signStealthSpend } from "@ckb-ccc/stealth";

async function findPayment(
  client: ccc.Client,
  viewKey: string,
  spendPublicKey: string,
  outPoint: ccc.OutPointLike,
) {
  const matches = await scanStealthCells(client, { viewKey, spendPublicKey });
  return matches.find(({ cell }) => cell.outPoint.eq(outPoint))?.cell;
}

async function sweepPayment(
  client: ccc.Client,
  cell: ccc.Cell,
  viewKey: string,
  spendKey: string,
) {
  const { tx } = signStealthSpend(client, {
    inputs: [cell],
    viewKey,
    spendKey,
    feeRate: 1000n, // shannons per 1,000 bytes
  });
  const txHash = await client.sendTransaction(tx);
  await client.waitTransaction(txHash);
  return { txHash, index: 0n }; // Scan this outpoint to find the fresh change.
}
```

Pass a cell returned by `findPayment` to `sweepPayment`. This sends its capacity minus the fee to a fresh lock owned by the same recipient. To pay a second recipient, pass `payment: { identifier, capacity }` to `signStealthSpend`, with capacity in shannons. Change below 94 CKB goes into the fee and is reported in `extraFee`. The helper accepts only plain stealth inputs and signs the raw transaction hash locally.

## Optional pay-only address resolver

For wallets that accept a payment destination through `Address.fromString`, the experimental resolver recognizes the proposed bech32m identifiers. Encode a testnet identifier from the recipient’s raw meta-address, then resolve it once while building the payment.

```ts
import { ccc } from "@ckb-ccc/core";
import {
  createStealthAddressResolver,
  encodeExperimentalStealthIdentifier,
} from "@ckb-ccc/stealth/experimental";

async function paymentLock(
  rawMetaAddress: string,
  fallback?: ccc.AddressResolver,
) {
  const identifier = encodeExperimentalStealthIdentifier(
    rawMetaAddress,
    "testnet",
  );
  const owner = ccc.ClientPublicTestnet.open({
    urls: ["https://testnet.ckb.dev/"],
    addressResolver: createStealthAddressResolver({ fallback }),
  });
  try {
    return (await ccc.Address.fromString(identifier, owner.value)).script;
  } finally {
    await owner.dispose();
  }
}
```

Each successful stealth resolution creates a fresh lock, even for the same identifier. Use the returned script for one payment. **Never use resolver results for balance queries or user identity.** To calculate a balance, sum the capacities returned by `scanStealthCells`. CCC parses ordinary CKB addresses directly. Other names go to the optional fallback when its `shouldResolve` accepts them. Invalid identifiers in the reserved stealth namespace fail validation.

## Privacy and trust

The one-time lock keeps the reusable recipient identifier off chain. Amounts, sender inputs, timing, the ephemeral public key, and the transaction graph remain visible. Observers can correlate a payment and its later spend or change using that public information. Someone with the view secret and public spend key can recognize the recipient’s outputs.

The scheme is **unaudited**. Both deployed scripts, `stealth-lock` and `ckb-auth`, are Type ID scripts upgradeable by a single deployer key. Control of that key allows the holder to change the code used to verify spends.
