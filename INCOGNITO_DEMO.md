# Incognito mode in the CCC application

This is a visual comparison of ordinary CKB addressing and stealth addressing inside the existing CCC application. It runs without a wallet connection or any chain-dependent privacy steps. The Incognito module uses public testnet fixtures and labels chain activity **SIMULATED** throughout.

This repository is the actual GitHub fork [`willy264/ccc`](https://github.com/willy264/ccc), whose parent is [`ckb-devrel/ccc`](https://github.com/ckb-devrel/ccc). The demo branch is `feat/incognito-mode-demo`, based on upstream `dev` at [`722cfe28bb184145e14887d54162d55fbe3dcadb`](https://github.com/ckb-devrel/ccc/commit/722cfe28bb184145e14887d54162d55fbe3dcadb). The application shell, module system and CCC components come from this full fork. This is not a separately recreated copy of the CCC interface.

The private `@ckb-ccc/stealth` package was ported from [`willy264/ckb-privacy` at `526b64babe27e54555a9450e4fa1a7ab96c74838`](https://github.com/willy264/ckb-privacy/tree/526b64babe27e54555a9450e4fa1a7ab96c74838/packages/stealth). Its local cryptographic implementation and independent test vector are preserved; it now consumes this fork's workspace CCC core. The name is experimental and is not a published official CCC package. Neither the fork nor this demo implies upstream acceptance, endorsement or security review.

## Run the comparison

Use Node.js 26, matching upstream CI, and the repository's pinned `pnpm@11.8.0`.

```sh
pnpm install --frozen-lockfile
pnpm --filter @ckb-ccc/app... build
pnpm --filter @ckb-ccc/stealth test
pnpm --filter @ckb-ccc/app start
```

The recursive app filter builds its workspace dependencies before building the Next.js application. Open <http://localhost:3000/#incognito>, or use **Compare Incognito · local demo** on the app's home screen. No real wallet, RPC endpoint or testnet balance is required for this module.

1. Leave **Incognito mode** off to preview a normal send to a reusable testnet address.
2. Switch it on to enter a stealth meta-address and derive a fresh one-time destination and ephemeral public key.
3. Compare the unsigned output and labelled CCC input, fee and signing handoff stages. Enable the fresh-change preview to derive a separate change address.
4. Open **Scan & receive** to match supplied local payment fixtures with the public view key and preview spend authority. The records are simulated and have no real transaction hashes or outpoints.
5. Open **Disclosure** to review what stealth addressing changes and which public transaction fields remain visible.

The receiving identity changes with the shared mode toggle. The demo makes it possible to compare the interaction in one CCC application without installing another wallet.

## Exact scope and boundaries

| Step | What actually happens |
| --- | --- |
| Normal send | Local full-format `ckt` address parsing and unsigned CCC output construction. No input selection, fee completion, signature or broadcast. |
| Stealth send | Local meta-address validation, ECDH derivation, one-time address encoding and unsigned CCC output construction. |
| Receive and scan | View-key matching against supplied public fixtures. No indexer or chain scan. |
| Spend preview | Local ownership verification, one-time spend-key derivation and fresh destination preparation. No live cell, witness or settlement. |
| Fresh change | A separately derived one-time destination. Capacity balancing and live change-output completion are not performed. |
| Chain-dependent stages | Clearly labelled simulations. No fake transaction hashes, confirmations or deployment claims. |

All fixture keys are public. **Never send assets to the displayed addresses.** They provide no secrecy or secure custody. The module has no wallet import, key storage or production signing adapter.

The new Incognito module deliberately does not use the host application's supplied client, signer, transaction submission callback or selected network. Testnet labels describe the local address format and fixture configuration; they do not establish a verified testnet transaction lifecycle. The original CCC Transfer module remains available separately. Other existing CCC modules can still perform their normal chain operations when a user explicitly connects a wallet and uses them; the Incognito module does not turn those existing modules into simulations.

Stealth addressing keeps a recipient's reusable identity out of the one-time output lock. **Amounts and sender inputs are not hidden.** The ephemeral public key, output locks, transaction graph and subsequent spending remain observable. Fresh change avoids direct address reuse, but amount, timing and network correlations remain possible. Public fixtures do not demonstrate anonymity.

The source-derived Obscell testnet lock configuration is documented in the [package README](packages/stealth/README.md). This work adds no contract and performs no live deployment verification. A reviewed lock-specific signer, verified deployment dependencies and an independently checked testnet lifecycle remain future integration work.

## Code map

| Location | Review focus |
| --- | --- |
| `packages/app/src/app/page.tsx` | Entry point in the existing CCC home screen. |
| `packages/app/src/app/modules.ts` | Registration in CCC's existing native module system. |
| `packages/app/src/app/modules/incognito/incognito-module.tsx` | Toggle, Send, Scan & receive, disclosure and honest-scope labels. |
| `packages/app/src/app/modules/incognito/use-incognito-demo.ts` | Local interaction state and preview lifecycle. |
| `packages/app/src/app/modules/incognito/local-transactions.ts` | Client-free normal-address parsing and unsigned draft serialization. |
| `packages/app/src/app/modules/incognito/fixtures.ts` | Explicitly public testnet identities and simulated incoming records. |
| `packages/stealth/src/` | Reusable local stealth derivation, record matching, ownership verification and unsigned CCC outputs. |
| `packages/stealth/src/testing/` | Public fixture keys and deterministic test-only derivation, separate from the reusable entry point. |
| `packages/stealth/test/` | Independent vector and adversarial package tests. |
| `packages/app/scripts/check-incognito.mjs` | Headless browser validation and optional evidence capture. |

## Validate and capture evidence

After building the application:

```sh
pnpm --filter @ckb-ccc/stealth test
pnpm --filter @ckb-ccc/stealth lint
pnpm --filter @ckb-ccc/app exec playwright install chromium
pnpm --filter @ckb-ccc/app test:incognito
pnpm --filter @ckb-ccc/app capture:incognito
```

The browser script starts the application server for its checks. Capture mode writes screenshots and a generated evidence manifest under `packages/app/evidence/incognito/`, including capture dates and SHA-256 hashes. These are screenshots of the local visual demo, not deployment or settlement evidence. See the [evidence index and validation results](packages/app/evidence/incognito/README.md), including the Windows limitation in an existing upstream packaging test.

## Review and next step

The useful first review is the CCC user experience: whether the opt-in toggle is understandable, whether a reusable address and a stealth meta-address are clearly distinguished, whether receiving and spending remain easy to follow, and whether the disclosure is sufficiently visible. Maintainer feedback on those interactions and the package boundary should guide subsequent work.

Live integration would require separate implementation and review of chain scanning, cell selection, capacity and fee completion, lock-specific signing, and verified testnet transactions. None is required to try this visual comparison. Mainnet readiness, an audit and upstream merging are not claimed.
