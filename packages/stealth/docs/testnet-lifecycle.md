# Testnet lifecycle

Build the workspace packages before running the script. From the repository root, run the following with throwaway recipient secrets in the ignored `.env` under `STEALTH_VIEW_SECRET` and `STEALTH_SPEND_SECRET`.

```sh
node --env-file=.env packages/stealth/scripts/testnet-lifecycle.mjs prepare
```

Send at least 200 testnet CKB from a normal CCC wallet to the printed one-time address. Then pass the funding transaction hash and decimal output index to the runner.

```sh
node --env-file=.env packages/stealth/scripts/testnet-lifecycle.mjs spend "<funding hash>:<index>"
```

The runner waits for funding to commit, scans for that exact outpoint, sweeps the cell to fresh stealth change, and waits for the committed change to appear in the scan. If the spend was broadcast but the scan did not finish, use `resume "<spend hash>:0"` to check the change without spending another cell.

The Vitest lifecycle test runs the same spend flow when `STEALTH_LIVE_LIFECYCLE=1` and `STEALTH_LIFECYCLE_FUND_OUTPOINT` identifies a fresh funded cell. Load the secrets into the test process environment first. Running the gated test consumes the selected input.

## Recorded testnet transactions

- Phase 0 funding at output `0`. [Explorer](https://testnet.explorer.nervos.org/transaction/0xc3b754ea14f104c65f7dc3b059aadc008cf99367152facd2ec61909c62c1d997)
- Phase 0 spend with fresh change at output `0`. The Phase 5 runner's `resume` command confirmed commitment and detected this live change using the package scanner. [Explorer](https://testnet.explorer.nervos.org/transaction/0x316e41550fe134cf22550860079c2f4ed5ee94556b47ef3bd3b6ceeb34540001)

The Phase 5 full run is awaiting a fresh funding outpoint.
