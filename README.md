# Cashu Futures

Draft application-layer specification for futures represented by Cashu
proofs.

- [NUT-32: Cashu Futures](NUT-32.md)

## Run the visual testnut

```sh
npm test
npm start
```

Open <http://localhost:8787>. The page shows the contract terms, wallet
tokens, event stream, and lifecycle: mint → swap → pay leverage → maturity →
physical settlement of MB into a `sat` token representing BTC.

The demo terms blobs are hosted on public Blossom at
<https://blossom.primal.net>. Their content-addressed URLs are used in the
future proof tags. Set `BLOSSOM_SERVER_URL` to override the host.

This is an in-memory, deterministic Cashu-shaped simulator for demonstrating
the NUT-32 metadata flow. It uses demo HMAC signatures and fake BTC; it is not
a production Cashu mint and must not receive real funds.

The nested `cashu-ts/` checkout is a separate implementation workspace and is
not part of this repository.
