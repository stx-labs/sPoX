# Solo stackers

This demo uses two solo stackers that generate their deposit address and use that
as PoX rewards address when stacking.

The stackers will use the signer key from devenv `signer-3` (for no specific reason)
when stacking.

## Install test dependencies

The scripts in `tests/` require `pnpm`.

Install the required dependencies for the demo:

```bash
cd tests
pnpm install --frozen-lockfile
```

## Run devenv

Ensure devenv (from sBTC) is running, and once Nakamoto is reached and the sBTC signers
bootstrap create a donation for them.

```bash
# From sBTC repo
make devenv-up
# Wait for devenv bootstrap, then fund the sBTC signers
cargo run -p signer --bin demo-cli donation
```

## Fund the stackers

Fund the stackers with enough STX to get a slot.

```bash
# From sBTC repo
cargo run -p signer --bin demo-cli fund-stx --recipient ST2FQWJMF9CGPW34ZWK8FEPNK072NEV1VKRNBBMJ9 --amount 4000000000
cargo run -p signer --bin demo-cli fund-stx --recipient ST2BMYXHQ63YP410C57808B1K9APN38KDQM9A0E6S --amount 1000000000
```

## Populate env variables

The sBTC signers xonly pubkey is not constant, so we need to get the one for the
current devenv run. It also impacts the reward addresses, so we need to compute
those as well.

For demo purposes, use `. tests/solo/populate_env.sh` (repeated in the snippets below)
to export in the current shell the required env variables.

The script will:
1. Run `RUST_LOG=info cargo run -- -c tests/solo/spox.toml get-signers-xonly-key`
   to get the signers aggregate address from the smart contract
2. Run `cargo run -- -c tests/solo/spox.toml get-deposit-address -n regtest`
   to compute the deposit addresses of Alice and Bob
3. Export `SPOX_*` env vars with the info from the above steps

## Start the staking loop

The stackers need to stack the STX and extend the commit every once in a while.
To do so, run the following:

```bash
. tests/solo/populate_env.sh
(cd tests && pnpm exec tsx solo/demo.ts loop $SPOX_DEMO_ALICE_SK:$SPOX_DEMO_ALICE_BTC_ADDRESS $SPOX_DEMO_BOB_SK:$SPOX_DEMO_BOB_BTC_ADDRESS)
```

## Run sPoX

With the above the stackers should start getting PoX payments, but without informing
Emily about it the sBTC signers will not process them. So, we run `spox`:

```bash
. tests/solo/populate_env.sh
cargo run -- -c tests/solo/spox.toml
```

It will keep looking for the pox payments and notify Emily.

## Clear exported env vars

If you need to rerun the demo in the same shell, you can clear the env vars with:
```bash
unset SPOX_DEPOSIT__ALICE__SIGNERS_XONLY SPOX_DEPOSIT__BOB__SIGNERS_XONLY SPOX_DEMO_ALICE_BTC_ADDRESS SPOX_DEMO_BOB_BTC_ADDRESS SPOX_DEMO_ALICE_SK SPOX_DEMO_BOB_SK
```

## Demo accounts

### Alice
```text
‣ Private Key:  3b1faa3d852d63860867557a9cf0587a06e89b9d8a385bee7139c7e65be7382401
‣ STX Address:  ST2FQWJMF9CGPW34ZWK8FEPNK072NEV1VKRNBBMJ9
```

### Bob
```text
‣ Private Key:  a46142592eaa52d38d17e07ddcf756c68a3efdab6a400fee9bc079ae7bfb3bf601
‣ STX Address:  ST2BMYXHQ63YP410C57808B1K9APN38KDQM9A0E6S
```
