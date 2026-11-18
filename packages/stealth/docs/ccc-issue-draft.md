# Draft CCC issue: stealth identifier resolver adapter

## Summary

Add an opt-in adapter pattern for packages that resolve application-specific identifiers into payment scripts, using CCC's existing `AddressResolver` hook.

## Proposal

An adapter for the Obscell stealth package would recognize only the proposed `ckts` and `ckbs` prefixes in `shouldResolve(address)`, decode and validate the identifier, then call `deriveStealthPayment(client, identifier)` in `resolve(address, client)` and return the derived lock.

The adapter must derive a fresh ephemeral key for every payment request. It must not scan balances, expose private keys, or alter CCC's address and identity model. The prefixes are deliberately separate from `ckt` and `ckb`, avoiding ambiguity with CCC's normal address parser and its full-address payload path whose first byte is `0x00`.

No new on-chain script or cryptography is required, and no core change is needed beyond the existing `AddressResolver` and `ClientConfig.addressResolver` APIs.

## Open review points

- Confirm whether `ckts` and `ckbs` should be reserved by CCC.
- Confirm the final bech32m payload version registry policy.
- Confirm whether a future resolver registry belongs in core or remains package-local.
