# Obscell stealth identifier format

This package accepts the legacy raw meta-address form for the stable API: `0x` followed by `view_pub(33 bytes) || spend_pub(33 bytes)`. The decoder requires exactly 66 bytes and validates both compressed secp256k1 points. The legacy form has no checksum or network marker, so callers must obtain the network from their client configuration.

## Proposed bech32m form

The experimental codec proposes prefixes distinct from CCC's ordinary address prefixes:

- `ckts` for CKB testnet
- `ckbs` for CKB mainnet

The bech32m data payload is `version(1 byte) || view_pub(33 bytes) || spend_pub(33 bytes)`. Version `0x01` identifies Obscell stealth-lock v1. Version `0x00` is reserved and must never be emitted or accepted. The bech32m checksum protects the payload and prefix.

Decoders reject malformed points, invalid checksums, unsupported versions, unknown prefixes, and a prefix that does not match the caller's expected network. The codec is exported only from `@ckb-ccc/stealth/experimental` until review. It is an identifier codec, not a change to CCC's address or identity model.
