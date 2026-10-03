# CCC Incognito visual demo evidence

These captures show the actual application in the [`willy264/ccc`](https://github.com/willy264/ccc) fork, with Incognito integrated into CCC's existing module workspace. They are **local visual-demo evidence, not deployment or settlement evidence**. No substitute application shell, injected DOM, mocked page content or screenshot-only styles were used.

The module runs without a connected wallet and uses explicitly public testnet fixture keys. One-time address derivation, fixture matching, ownership checks and unsigned CCC output construction execute locally. Chain scanning, live input selection, fee completion, signing, broadcasting and confirmation are not performed. Never send assets to the displayed addresses. Amounts and sender inputs remain public in the target design.

## Screenshots

| Capture | What it demonstrates |
| --- | --- |
| [01 - CCC tool matrix](01-ccc-tool-matrix.png) | Existing CCC application and modules with a new entry for the local Incognito comparison. |
| [02 - Normal mode](02-normal-mode.png) | Reusable testnet receiving address and normal-send preview using public fixtures; no wallet or chain operation. |
| [03 - Incognito mode](03-incognito-mode.png) | The same CCC workspace with Incognito enabled and a public stealth meta-address. |
| [04 - Stealth send](04-stealth-send.png) | Locally derived one-time address, ephemeral public key, fresh-change preview and unsigned CCC output. Chain-dependent stages are simulated. |
| [05 - Scan and receive](05-scan-receive.png) | Local fixture recognition and spend-authority preview; no indexer, live outpoint or signed spend. |
| [06 - Mode comparison](06-mode-comparison.png) | Normal and Incognito behavior compared within the application; both expose amounts and sender inputs. |
| [07 - Disclosure](07-disclosure.png) | Visible explanation of recipient linkage, public transaction fields and simulation limits. |
| [08 - Mobile disclosure](08-mobile-disclosure.png) | The same module and disclosure at a 390px viewport width. |

Desktop captures use a 1440px viewport width. The capture script adjusts the viewport height to the content and uses `fullPage: false`, avoiding Chromium capture artifacts from CCC's existing closed fixed-position log drawer. It does not alter the rendered DOM or styles to create the evidence.

## Capture record and integrity

The generated [manifest.json](manifest.json) is the authoritative record for each capture date, PNG SHA-256 hash, viewport and image dimensions. It also records the browser version, fork and branch, upstream base, source commit, `dirtySourceAtCapture` and SHA-256 digests of the inspected application, package and lockfile sources. Consult that flag and the source digests when identifying the exact working tree captured; a commit identifier alone does not prove that the tree was clean.

All external requests are blocked during browser validation. The recorded run attempted six presentation-only requests for CCC's exact upstream favicon URL; all six were blocked and are listed in the manifest. No external data requests or browser page errors were observed. This demonstrates the checked local flow, not a claim about every existing CCC module or a future live integration.

## Reproduce

From the repository root, using upstream's Node.js 26 and pinned pnpm 11.8.0:

```sh
pnpm install --frozen-lockfile
pnpm --filter @ckb-ccc/app... build
pnpm --filter @ckb-ccc/app exec playwright install chromium
pnpm --filter @ckb-ccc/app test:incognito
pnpm --filter @ckb-ccc/app capture:incognito
```

The [Playwright script](../../scripts/check-incognito.mjs) starts the production application server and runs the interaction checks. Capture mode writes the PNGs and regenerates the manifest in this directory. Fresh one-time derivation is random, so a later capture can legitimately have different addresses and hashes. These screenshots contain public fixtures only.

See the [integration guide](../../../../INCOGNITO_DEMO.md) for package provenance, local-demo access and the implementation map.

## Validation and limitation

Local validation used **Windows, Node.js 25.8.1 and pnpm 11.8.0**. Upstream CI targets **Linux and Node.js 26**; the local results below are not a substitute for that CI run.

| Check | Local result |
| --- | --- |
| Production application build and TypeScript checks | Passed. |
| Application ESLint | Passed. |
| Stealth package | All 15 tests passed. |
| Existing upstream Vitest suites | 60 files and 610 tests passed. |
| Browser interaction and capture checks | Passed: normal and Incognito modes, fresh change, matching and unrelated fixtures, spend preview, reset, disclosure and 1440px/390px layouts. Eight screenshots captured. |
| Existing package consumption checks | CommonJS passed. The unchanged ESM test fails on Windows because it constructs a file URL from a Windows path incorrectly. |

The ESM limitation is in [`packages/tests/tests/esm.test.mts`](../../../tests/tests/esm.test.mts): its `file://${path.join(...)}` expression produces a form such as `file://C:\...` instead of the portable `file:///C:/...` URL. This existing platform issue means the aggregate root `test:ci` command is **not reported as passing**. It does not change the separately observed application, package or Vitest results above, and it has not been patched as part of this visual-demo work.
