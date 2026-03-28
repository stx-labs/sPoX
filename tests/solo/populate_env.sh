#!/usr/bin/env sh

spox_signers_xonly=$(
  RUST_LOG=info cargo run -- -c tests/solo/spox.toml get-signers-xonly-key
)
if [ -z "$spox_signers_xonly" ]; then
  echo "ERROR: failed to get signers xonly key" >&2
  return 1
fi

export SPOX_DEPOSIT__ALICE__SIGNERS_XONLY="$spox_signers_xonly"
export SPOX_DEPOSIT__BOB__SIGNERS_XONLY="$spox_signers_xonly"

spox_deposit_addresses=$(
  cargo run -- -c tests/solo/spox.toml get-deposit-address -n regtest
)
if [ -z "$spox_deposit_addresses" ]; then
  echo "ERROR: failed to get deposit addresses" >&2
  return 1
fi
# This will output something like:
#   alice: bcrt1psg8wccjeu2x4kalmvuy596aja2e34cz98t6uanm7fspp5hf05xyq5q294l
#   bob: bcrt1p9rm286h5q2dfr6230qesd34frku8teps9vv9szyye6l0j55xqxrqssaklm

while IFS=: read -r name addr; do
  name=$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')
  addr=${addr# }
  export "SPOX_DEMO_${name}_BTC_ADDRESS=$addr"
done <<EOF
$spox_deposit_addresses
EOF

if [ -z "$SPOX_DEMO_ALICE_BTC_ADDRESS" ]; then
  echo "ERROR: failed to parse Alice's BTC address from deposit addresses output" >&2
  return 1
fi
if [ -z "$SPOX_DEMO_BOB_BTC_ADDRESS" ]; then
  echo "ERROR: failed to parse Bob's BTC address from deposit addresses output" >&2
  return 1
fi

export SPOX_DEMO_ALICE_SK=3b1faa3d852d63860867557a9cf0587a06e89b9d8a385bee7139c7e65be7382401
export SPOX_DEMO_BOB_SK=a46142592eaa52d38d17e07ddcf756c68a3efdab6a400fee9bc079ae7bfb3bf601

unset spox_signers_xonly spox_deposit_addresses
