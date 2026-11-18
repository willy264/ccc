# Scanning stealth cells

`scanStealthCells(client, { viewKey, spendPublicKey })` uses CCC's paginated lock prefix search and deduplicates candidates by outpoint. It matches plain CKB cells locally and returns the cell, its ephemeral public key, and the derived one-time public key. The spend secret is only needed when deriving a signing key.

Obscell has no view tag. A full scan fetches all live candidates for the deployment and performs one ECDH operation locally per well-formed plain CKB candidate. Scan cost grows with the number of candidate cells on chain.

The opt-in test reads `STEALTH_LIVE_SCAN=1`, `STEALTH_VIEW_SECRET`, `STEALTH_SPEND_SECRET`, and `STEALTH_SCAN_OUTPOINT` from the test process environment. Keep the throwaway keys in the ignored `.env` and use the expected live outpoint in `0x<transaction hash>:<decimal index>` form.
