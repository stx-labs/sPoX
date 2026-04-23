# sBTC Autobridge — Web App

A web app that generates an sBTC deposit address and registers it on the spox
smart contract, so any BTC sent there is automatically bridged to sBTC by
[spox](https://github.com/stx-labs/sPoX).

A typical use case is receiving PoX rewards as sBTC — register the deposit
address as your PoX reward address and let spox auto-bridge every payout —
but the same flow works for any recurring BTC payment stream where you'd prefer
sBTC on Stacks.

## Getting Started

```bash
cd webapp
pnpm install
cp .env.example .env   # then edit with your values
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001).

### Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_NETWORK` | Stacks network: `mainnet`, `testnet`, or `devnet`. The Bitcoin network is derived automatically (`mainnet` or `regtest`). |
| `NEXT_PUBLIC_SPOX_REGISTRY_CONTRACT` | Qualified contract id of the spox registry (e.g. `ST1234….registry`). |
| `NEXT_PUBLIC_SBTC_REGISTRY_CONTRACT` | Qualified contract id of the sBTC registry (used to fetch the signers aggregate key). |
| `NEXT_PUBLIC_DEFAULT_MAX_FEE` | Default max fee in sats (default: `80000`). |
| `NEXT_PUBLIC_DEFAULT_LOCK_TIME` | Default lock time in blocks (default: `144`). |

## Reclaim Configuration

Every deposit address embeds a reclaim spending path so the sender can recover
the funds if the sBTC signers don't fulfil the deposit. The app supports two modes:

- **Public Key** (default, auto-filled from wallet) — a compressed Bitcoin
  public key in hex (33 bytes, starting with `02` or `03`). When a wallet is
  connected, the app takes the public key from a non-taproot address (taproot
  is not supported). The source wallet address is shown for verification.
- **Custom Script (hex)** — a raw spending condition, appended after
  `<lockTime> OP_CSV`. Use this for multisig or other advanced reclaim setups.

## Verify Scripts & Address Derivation

After generating a deposit address, the app shows a step-by-step breakdown of
how the address is derived from the deposit and reclaim scripts, following
BIP-341 (Taproot):

1. Script hex and ASM disassembly for both deposit and reclaim scripts
2. TapLeaf hashes for each script
3. TapBranch hash (sorted concatenation of leaf hashes)
4. TapTweak from the NUMS internal key and the branch hash
5. Tweaked public key via EC point addition
6. Final bech32m-encoded deposit address

Each step links to external references (learnmeabitcoin.com, BIPs) with
interactive tools for independent verification.

## Tests

```bash
pnpm exec vitest run
```

Covers the Bitcoin script/derivation helpers ([tests/bitcoin.test.ts](tests/bitcoin.test.ts))
and deposit input validation ([tests/deposit.test.ts](tests/deposit.test.ts)).

## Build

```bash
pnpm build
pnpm start
```
