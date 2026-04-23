import { hex } from "@scure/base";

/** BIP341 "Nothing Up My Sleeve" x-only public key — no known private key. */
export const NUMS_X_COORDINATE = hex.decode(
  "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
);

type StacksNetworkName = "mainnet" | "testnet" | "devnet";
const VALID_NETWORKS: StacksNetworkName[] = ["mainnet", "testnet", "devnet"];

const envNetwork = process.env.NEXT_PUBLIC_NETWORK ?? "devnet";
if (!VALID_NETWORKS.includes(envNetwork as StacksNetworkName)) {
  throw new Error(`Invalid NEXT_PUBLIC_NETWORK "${envNetwork}". Must be one of: ${VALID_NETWORKS.join(", ")}`);
}
export const STACKS_NETWORK = envNetwork as StacksNetworkName;
export const BTC_NETWORK: "mainnet" | "regtest" =
  STACKS_NETWORK === "mainnet" ? "mainnet" : "regtest";

export const REGISTRY_CONTRACT =
  process.env.NEXT_PUBLIC_SPOX_REGISTRY_CONTRACT ?? "";
export const SBTC_REGISTRY_CONTRACT =
  process.env.NEXT_PUBLIC_SBTC_REGISTRY_CONTRACT ?? "";

const STACKS_EXPLORER_BASE =
  STACKS_NETWORK === "devnet" ? "http://localhost:3020" : "https://explorer.hiro.so";
const STACKS_EXPLORER_SUFFIX =
  STACKS_NETWORK === "mainnet"
    ? ""
    : STACKS_NETWORK === "devnet"
      ? "?chain=testnet&api=http://localhost:3999"
      : `?chain=${STACKS_NETWORK}`;
export function stacksExplorerTxUrl(txId: string): string {
  return `${STACKS_EXPLORER_BASE}/txid/${txId}${STACKS_EXPLORER_SUFFIX}`;
}

export const DEFAULT_MAX_FEE = Number(
  process.env.NEXT_PUBLIC_DEFAULT_MAX_FEE ?? "80000",
);
export const DEFAULT_LOCK_TIME = Number(
  process.env.NEXT_PUBLIC_DEFAULT_LOCK_TIME ?? "144",
);
