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

- Phase 5 funding delivered 10,000 testnet CKB to output `0`. The gated lifecycle test detected that exact cell with `scanStealthCells`. [Funding transaction](https://testnet.explorer.nervos.org/transaction/0xfea490a8895a15e6300b79775d11036f515ba2b77f316b0c72de512d5e6bbf38)
- The test spent the funding cell to a fresh stealth lock for the same recipient. After the transaction committed, a second scan detected the change at output `0`. [Spend and change transaction](https://testnet.explorer.nervos.org/transaction/0x60f6cebbf82ee838da91deef68fce4f2fc1427a280376da40f07481b843c698f)

On 2026-11-19, all 12 package tests passed at commit `6bf7eeb1` with both live tests enabled. The independent scan found the Phase 0 change. The lifecycle test spent the Phase 5 change to a fresh lock for the same recipient and detected the committed output at index `0`. [Verification spend](https://testnet.explorer.nervos.org/transaction/0x3a83d500ea797d5769bbeb8f0b7949ba8ea9911defc5cb4f3350e27520f74a2a)
