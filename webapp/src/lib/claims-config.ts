import {
  createNetwork,
  defaultUrlFromNetwork,
  type StacksNetwork,
  type StacksNetworkName,
} from "@stacks/network";
import { AddressVersion, createAddress, parsePrincipalString } from "@stacks/transactions";

export type ClaimsNetworkName = "mainnet" | "testnet" | "devnet";

const VALID_NETWORKS: ClaimsNetworkName[] = ["mainnet", "testnet", "devnet"];

/** Well-known Stacks API base URL for each network. */
export function defaultApiUrlForNetwork(
  network: ClaimsNetworkName,
): string {
  return defaultUrlFromNetwork(network as StacksNetworkName);
}

/** Boot address that deploys pox / pox-5 (and a safe read-only call sender). */
export function bootAddressForNetwork(network: ClaimsNetworkName): string {
  return network === "mainnet"
    ? "SP000000000000000000002Q6VF78"
    : "ST000000000000000000002AMW42H";
}

/** Qualified pox-5 boot contract for the selected network. */
export function pox5ContractForNetwork(network: ClaimsNetworkName): string {
  return `${bootAddressForNetwork(network)}.pox-5`;
}

/**
 * Parse the address version byte from a standard or contract principal.
 * Returns null when the input is empty or not a valid c32check address.
 */
export function principalAddressVersion(address: string): number | null {
  const base = address.trim().split(".")[0] ?? "";
  if (!base) return null;
  try {
    return createAddress(base).version;
  } catch {
    return null;
  }
}

function isMainnetAddressVersion(version: number): boolean {
  return (
    version === AddressVersion.MainnetSingleSig ||
    version === AddressVersion.MainnetMultiSig
  );
}

/**
 * Infer whether a Stacks principal belongs on mainnet or testnet/devnet
 * from its c32check version byte. Only mainnet single-sig (22) and multi-sig
 * (20) count as mainnet; all other version bytes are testnet. Contract
 * principals use the address portion before the first `.`. Returns null when
 * the address is missing or not yet a valid c32check string.
 */
export function stacksAddressNetworkKind(
  address: string,
): "mainnet" | "testnet" | null {
  const version = principalAddressVersion(address);
  if (version === null) return null;
  return isMainnetAddressVersion(version) ? "mainnet" : "testnet";
}

/**
 * Whether a principal's version prefix matches the selected Stacks network.
 * `null` means the address is empty or not recognizable yet.
 */
export function principalMatchesNetwork(
  address: string,
  network: ClaimsNetworkName,
): boolean | null {
  if (!address.trim()) return null;
  const kind = stacksAddressNetworkKind(address);
  if (kind === null) return null;
  if (network === "mainnet") return kind === "mainnet";
  return kind === "testnet";
}

/**
 * Build-time registry contract for a network.
 *
 * Prefers `NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_{MAINNET|TESTNET|DEVNET}`.
 * Falls back to legacy `NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT` only for the
 * build-time `NEXT_PUBLIC_NETWORK`, so switching networks in developer mode
 * does not reuse the wrong deployment.
 */
export function claimsContractForNetwork(
  network: ClaimsNetworkName,
): string {
  const perNetwork =
    {
      mainnet: process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_MAINNET,
      testnet: process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_TESTNET,
      devnet: process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_DEVNET,
    }[network]?.trim() ?? "";
  if (perNetwork) return perNetwork;

  const legacy =
    process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT?.trim() ?? "";
  if (legacy && network === parseNetwork(process.env.NEXT_PUBLIC_NETWORK)) {
    return legacy;
  }
  return "";
}

const STORAGE_DEV_MODE = "spox_claims_dev_mode";
const STORAGE_OVERRIDES = "spox_claims_overrides";

export interface ClaimsOverrides {
  network?: ClaimsNetworkName;
  apiUrl?: string;
  claimsContract?: string;
}

export interface ClaimsConfig {
  network: ClaimsNetworkName;
  apiUrl: string;
  claimsContract: string;
  stacksNetwork: StacksNetwork;
  developerMode: boolean;
  overrides: ClaimsOverrides;
  usingOverrides: boolean;
}

function parseNetwork(value: string | undefined): ClaimsNetworkName {
  if (value && VALID_NETWORKS.includes(value as ClaimsNetworkName)) {
    return value as ClaimsNetworkName;
  }
  return "mainnet";
}

/**
 * Public-site defaults. Developer mode off always reads mainnet, regardless of
 * `NEXT_PUBLIC_NETWORK` or stored overrides (those apply only in developer mode).
 */
export function getDefaultClaimsConfig(): Omit<
  ClaimsConfig,
  "developerMode" | "overrides" | "usingOverrides"
> {
  const network: ClaimsNetworkName = "mainnet";
  const apiUrl = defaultApiUrlForNetwork(network);
  const claimsContract = claimsContractForNetwork(network);

  return {
    network,
    apiUrl,
    claimsContract,
    stacksNetwork: createNetwork({
      network: network as StacksNetworkName,
      client: { baseUrl: apiUrl },
    }),
  };
}

export function readDeveloperMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_DEV_MODE) === "1";
}

export function writeDeveloperMode(enabled: boolean) {
  localStorage.setItem(STORAGE_DEV_MODE, enabled ? "1" : "0");
}

export function readOverrides(): ClaimsOverrides {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(STORAGE_OVERRIDES);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ClaimsOverrides;
    const overrides: ClaimsOverrides = {};
    if (
      parsed.network &&
      VALID_NETWORKS.includes(parsed.network as ClaimsNetworkName)
    ) {
      overrides.network = parsed.network;
    }
    if (typeof parsed.apiUrl === "string" && parsed.apiUrl.trim()) {
      overrides.apiUrl = parsed.apiUrl.trim();
    }
    if (
      typeof parsed.claimsContract === "string" &&
      parsed.claimsContract.trim()
    ) {
      overrides.claimsContract = parsed.claimsContract.trim();
    }
    return overrides;
  } catch {
    localStorage.removeItem(STORAGE_OVERRIDES);
    return {};
  }
}

export function writeOverrides(overrides: ClaimsOverrides) {
  const cleaned: ClaimsOverrides = {};
  if (overrides.network) cleaned.network = overrides.network;
  if (overrides.apiUrl?.trim()) cleaned.apiUrl = overrides.apiUrl.trim();
  if (overrides.claimsContract?.trim()) {
    cleaned.claimsContract = overrides.claimsContract.trim();
  }
  localStorage.setItem(STORAGE_OVERRIDES, JSON.stringify(cleaned));
}

export function clearOverrides() {
  localStorage.removeItem(STORAGE_OVERRIDES);
}

/** Resolve effective config from defaults + optional runtime overrides. */
export function resolveClaimsConfig(
  developerMode: boolean,
  overrides: ClaimsOverrides,
): ClaimsConfig {
  const defaults = getDefaultClaimsConfig();
  if (!developerMode) {
    return {
      ...defaults,
      developerMode: false,
      overrides,
      usingOverrides: false,
    };
  }

  const network = overrides.network ?? defaults.network;
  const apiUrl = overrides.apiUrl
    ? overrides.apiUrl
    : defaultApiUrlForNetwork(network);
  const claimsContract = overrides.claimsContract
    ? overrides.claimsContract
    : claimsContractForNetwork(network);

  return {
    network,
    apiUrl,
    claimsContract,
    stacksNetwork: createNetwork({
      network: network as StacksNetworkName,
      client: { baseUrl: apiUrl },
    }),
    developerMode: true,
    overrides,
    usingOverrides: true,
  };
}

export function splitContractId(
  contractId: string,
): { address: string; name: string } | null {
  const trimmed = contractId.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  return {
    address: trimmed.slice(0, dot),
    name: trimmed.slice(dot + 1),
  };
}

/**
 * Whether `contractId` is a fully formed contract principal: valid c32check
 * address and non-empty contract name. Standard principals (no `.`) are rejected.
 */
export function isValidContractPrincipal(contractId: string): boolean {
  const trimmed = contractId.trim();
  if (!trimmed.includes(".")) return false;
  try {
    const parsed = parsePrincipalString(trimmed) as {
      contractName?: { content?: string };
    };
    const name = parsed.contractName?.content;
    return typeof name === "string" && name.length > 0;
  } catch {
    return false;
  }
}

/** Trait defined in the reward-claim-registry contract. */
export const REWARD_CLAIM_SIGNER_MANAGER_TRAIT =
  "reward-claim-signer-manager-trait";

/** Stacks node URL to check whether a contract implements the registry trait. */
export function traitImplementationUrl(
  config: Pick<ClaimsConfig, "apiUrl" | "claimsContract">,
  implementerContractId: string,
): string | null {
  const implementer = splitContractId(implementerContractId);
  const traitDef = splitContractId(config.claimsContract);
  if (!implementer || !traitDef) return null;
  const base = config.apiUrl.replace(/\/$/, "");
  return `${base}/v2/traits/${implementer.address}/${implementer.name}/${traitDef.address}/${traitDef.name}/${REWARD_CLAIM_SIGNER_MANAGER_TRAIT}`;
}

export function stacksExplorerTxUrlForConfig(
  txId: string,
  config: Pick<ClaimsConfig, "network" | "apiUrl">,
): string {
  if (config.network === "devnet") {
    const api = encodeURIComponent(config.apiUrl);
    return `http://localhost:3020/txid/${txId}?chain=testnet&api=${api}`;
  }
  const base = "https://explorer.hiro.so";
  if (config.network === "mainnet") {
    return `${base}/txid/${txId}`;
  }
  return `${base}/txid/${txId}?chain=${config.network}`;
}

export const MICRO_STX = 1_000_000n;
/** Matches reward-claim-registry MAX_CLAIM_INSTALLMENTS. */
export const MAX_CLAIM_INSTALLMENTS = 192n;

export function formatStxFromMicro(micro: bigint): string {
  const whole = micro / MICRO_STX;
  const frac = micro % MICRO_STX;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export function parseStxToMicro(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed || !/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  return BigInt(whole) * MICRO_STX + BigInt(frac.padEnd(6, "0"));
}

/** STX escrow for a whole number of prepaid claim installments. */
export function feeMicroForClaimCount(
  claimCount: bigint,
  feePerClaim: bigint,
): bigint {
  return claimCount * feePerClaim;
}

/**
 * Resolve the claim count for register/add-claims from the form inputs.
 * Prefers an explicit claim count; otherwise derives from escrow when the rate is known.
 */
export function parseClaimCount(
  claimCountInput: string,
  feeStxInput: string,
  feePerClaim: bigint | null,
): bigint | null {
  const trimmed = claimCountInput.trim();
  if (trimmed) {
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const count = BigInt(parsed);
    return count > MAX_CLAIM_INSTALLMENTS ? MAX_CLAIM_INSTALLMENTS : count;
  }
  if (feePerClaim !== null && feePerClaim > 0n) {
    const micro = parseStxToMicro(feeStxInput);
    if (micro === null || micro <= 0n) return null;
    const raw = micro / feePerClaim;
    if (raw <= 0n) return null;
    return raw > MAX_CLAIM_INSTALLMENTS ? MAX_CLAIM_INSTALLMENTS : raw;
  }
  return null;
}

export function stacksExplorerContractUrlForConfig(
  contractId: string,
  config: Pick<ClaimsConfig, "network" | "apiUrl">,
): string | null {
  const trimmed = contractId.trim();
  if (!splitContractId(trimmed)) return null;

  if (config.network === "devnet") {
    const api = encodeURIComponent(config.apiUrl);
    return `http://localhost:3020/txid/${trimmed}?chain=testnet&api=${api}&ssr=false`;
  }

  const base = "https://explorer.hiro.so";
  if (config.network === "mainnet") {
    return `${base}/txid/${trimmed}`;
  }
  return `${base}/txid/${trimmed}?chain=${config.network}`;
}
