import { describe, expect, it } from "vitest";
import {
  validateDepositInputs,
  type DepositInputs,
} from "../src/lib/deposit";

// NEXT_PUBLIC_NETWORK defaults to "devnet" for tests, so principal prefixes
// ST/SN are the valid ones. SP/SM would be rejected.
const VALID_STX = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const VALID_PUBKEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function baseline(overrides: Partial<DepositInputs> = {}): DepositInputs {
  return {
    stxAddress: VALID_STX,
    reclaimMode: "pubkey",
    btcPubKey: VALID_PUBKEY,
    reclaimScriptHex: "",
    maxFee: 80_000,
    lockTime: 144,
    ...overrides,
  };
}

describe("validateDepositInputs", () => {
  it("returns null for valid inputs", () => {
    expect(validateDepositInputs(baseline())).toBeNull();
  });

  it("accepts a valid custom reclaim script", () => {
    expect(
      validateDepositInputs(
        baseline({ reclaimMode: "script", reclaimScriptHex: "7551" }),
      ),
    ).toBeNull();
  });

  describe("stxAddress", () => {
    it("rejects empty", () => {
      expect(validateDepositInputs(baseline({ stxAddress: "" }))).toMatch(
        /required/,
      );
    });

    it("rejects mainnet principal on devnet", () => {
      expect(
        validateDepositInputs(
          baseline({ stxAddress: "SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM" }),
        ),
      ).toMatch(/must start with ST or SN/);
    });

    it("accepts SN (multisig) principal on devnet", () => {
      expect(
        validateDepositInputs(
          baseline({ stxAddress: "SN3R84XZYA63QS28932XQF3G1J8R9PC3W76P9CSQS" }),
        ),
      ).toBeNull();
    });

    it("accepts contract principal (strips after dot)", () => {
      expect(
        validateDepositInputs(
          baseline({ stxAddress: `${VALID_STX}.my-contract` }),
        ),
      ).toBeNull();
    });
  });

  describe("btcPubKey (pubkey mode)", () => {
    it("rejects empty", () => {
      expect(
        validateDepositInputs(baseline({ btcPubKey: "" })),
      ).toMatch(/required/);
    });

    it("rejects non-hex", () => {
      expect(
        validateDepositInputs(baseline({ btcPubKey: "not-a-hex-string-xy" })),
      ).toMatch(/valid hex/);
    });

    it("rejects wrong length", () => {
      expect(
        validateDepositInputs(baseline({ btcPubKey: "0279be66" })),
      ).toMatch(/33 bytes/);
    });

    it("rejects uncompressed (04 prefix)", () => {
      const uncompressed = "04" + "a".repeat(64);
      expect(
        validateDepositInputs(baseline({ btcPubKey: uncompressed })),
      ).toMatch(/compressed key/);
    });

    it("tolerates a leading 0x prefix", () => {
      expect(
        validateDepositInputs(baseline({ btcPubKey: `0x${VALID_PUBKEY}` })),
      ).toBeNull();
    });

    it("ignores btcPubKey in script mode", () => {
      expect(
        validateDepositInputs(
          baseline({
            reclaimMode: "script",
            reclaimScriptHex: "7551",
            btcPubKey: "invalid",
          }),
        ),
      ).toBeNull();
    });
  });

  describe("reclaimScriptHex (script mode)", () => {
    it("rejects empty", () => {
      expect(
        validateDepositInputs(
          baseline({ reclaimMode: "script", reclaimScriptHex: "" }),
        ),
      ).toMatch(/Reclaim script hex is required/);
    });
  });

  describe("numeric bounds", () => {
    it("rejects maxFee <= 0", () => {
      expect(validateDepositInputs(baseline({ maxFee: 0 }))).toMatch(
        /Max fee/,
      );
      expect(validateDepositInputs(baseline({ maxFee: -1 }))).toMatch(
        /Max fee/,
      );
    });

    it("rejects lockTime <= 0", () => {
      expect(validateDepositInputs(baseline({ lockTime: 0 }))).toMatch(
        /Lock time/,
      );
    });
  });
});
