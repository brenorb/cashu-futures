# Cashu Futures

Draft application-layer specification for futures represented by Cashu
proofs.

- [NUT-32: Cashu Futures](NUT-32.md)

## Run the visual testnut

```sh
npm test
npm run blossom
npm start
```

Run `npm run blossom` and `npm start` in separate terminals, then open
<http://localhost:8787>. The page shows the contract terms, wallet
tokens, event stream, and lifecycle: mint → swap → pay leverage → maturity →
physical settlement into a `sat` token.

The demo terms blob is uploaded to the local Blossom server with
`uvx blossom-cli`; its content-addressed URL is used in the future proof tag.

This is an in-memory, deterministic Cashu-shaped simulator for demonstrating
the NUT-32 metadata flow. It uses demo HMAC signatures and fake BTC; it is not
a production Cashu mint and must not receive real funds.

The nested `cashu-ts/` checkout is a separate implementation workspace and is
not part of this repository.
