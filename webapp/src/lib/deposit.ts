import {
  createDepositScript,
  createDepositAddress,
  createReclaimScript,
  singleSigSpendScript,
  computeTaprootDerivation,
  fromHex,
  type TaprootDerivation,
} from "./bitcoin";
import { fetchAggregateKey } from "./stacks-api";
import { STACKS_NETWORK } from "./constants";

export type ReclaimMode = "pubkey" | "script";

export interface GeneratedResult {
  depositAddress: string;
  depositScript: Uint8Array;
  reclaimScript: Uint8Array;
  derivation: TaprootDerivation;
}

export interface DepositInputs {
  stxAddress: string;
  reclaimMode: ReclaimMode;
  btcPubKey: string;
  reclaimScriptHex: string;
  maxFee: number;
  lockTime: number;
}

/** Returns an error message, or null if the inputs are valid. */
export function validateDepositInputs(input: DepositInputs): string | null {
  if (!input.stxAddress) {
    return "Stacks recipient address is required.";
  }
  const stxPrincipal = input.stxAddress.split(".")[0];
  const validPrefixes =
    STACKS_NETWORK === "mainnet" ? ["SP", "SM"] : ["ST", "SN"];
  if (!validPrefixes.some((p) => stxPrincipal.startsWith(p))) {
    return `Stacks address must start with ${validPrefixes.join(" or ")} for ${STACKS_NETWORK}.`;
  }
  if (input.reclaimMode === "pubkey") {
    const cleaned = input.btcPubKey.replace(/^0x/, "");
    if (!cleaned) return "Bitcoin public key is required.";
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) return "Public key must be valid hex.";
    if (cleaned.length !== 66) {
      return (
        "Public key must be 33 bytes (66 hex characters). Got " +
        cleaned.length / 2 +
        " bytes."
      );
    }
    if (cleaned[0] !== "0" || (cleaned[1] !== "2" && cleaned[1] !== "3")) {
      return "Public key must be a compressed key starting with 02 or 03.";
    }
  }
  if (input.maxFee <= 0) return "Max fee must be greater than 0.";
  if (input.lockTime <= 0) return "Lock time must be greater than 0.";
  if (input.reclaimMode === "script" && !input.reclaimScriptHex) {
    return "Reclaim script hex is required.";
  }
  return null;
}

export async function generateDeposit(
  input: DepositInputs,
): Promise<GeneratedResult> {
  const aggregateKey = await fetchAggregateKey();
  const depositScript = createDepositScript(
    aggregateKey,
    input.maxFee,
    input.stxAddress,
  );

  const spendScript =
    input.reclaimMode === "pubkey"
      ? singleSigSpendScript(fromHex(input.btcPubKey))
      : fromHex(input.reclaimScriptHex);
  const reclaimScript = createReclaimScript(input.lockTime, spendScript);

  const depositAddress = createDepositAddress(depositScript, reclaimScript);
  const derivation = computeTaprootDerivation(depositScript, reclaimScript);

  return {
    depositAddress,
    depositScript,
    reclaimScript,
    derivation,
  };
}
