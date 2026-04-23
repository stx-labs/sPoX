import { fetchCallReadOnlyFunction, ClarityType } from "@stacks/transactions";
import type { ClarityValue, BufferCV } from "@stacks/transactions";
import { STACKS_NETWORK, SBTC_REGISTRY_CONTRACT } from "./constants";
import { fromHex } from "./bitcoin";

/**
 * Fetch the current sBTC signers aggregate public key from the sbtc-registry contract.
 * Returns the raw compressed public key bytes (33 bytes).
 */
export async function fetchAggregateKey(): Promise<Uint8Array> {
  const [contractAddress, contractName] = SBTC_REGISTRY_CONTRACT.split(".");
  if (!contractAddress || !contractName) {
    throw new Error(
      "NEXT_PUBLIC_SBTC_REGISTRY_CONTRACT is not set or malformed",
    );
  }

  let result: ClarityValue;
  try {
    result = await fetchCallReadOnlyFunction({
      contractAddress,
      contractName,
      functionName: "get-current-aggregate-pubkey",
      functionArgs: [],
      senderAddress: contractAddress,
      network: STACKS_NETWORK,
    });
  } catch (e) {
    throw new Error(
      `Cannot reach Stacks API (network: ${STACKS_NETWORK}). Make sure the node is running and the URL is correct.`,
      { cause: e },
    );
  }

  // Unwrap (ok (some (buff ...)))
  const inner = unwrapClarityBuffer(result);
  return fromHex(inner);
}

/** Walk through ok/some wrappers to extract the inner buffer hex. */
function unwrapClarityBuffer(cv: ClarityValue): string {
  switch (cv.type) {
    case ClarityType.ResponseOk:
      return unwrapClarityBuffer(cv.value);
    case ClarityType.ResponseErr:
      throw new Error(
        `sBTC registry returned an error: ${cv.value}`,
      );
    case ClarityType.OptionalSome:
      return unwrapClarityBuffer(cv.value);
    case ClarityType.OptionalNone:
      throw new Error(
        "No sBTC aggregate key configured in the registry contract.",
      );
    case ClarityType.Buffer:
      return (cv as BufferCV).value;
    default:
      throw new Error(
        `Unexpected Clarity type ${cv.type} in aggregate key response`,
      );
  }
}
