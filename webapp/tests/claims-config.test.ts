import { describe, expect, it } from "vitest";
import {
  bootAddressForNetwork,
  claimsContractForNetwork,
  defaultApiUrlForNetwork,
  feeMicroForClaimCount,
  parseClaimCount,
  formatStxFromMicro,
  parseStxToMicro,
  isValidContractPrincipal,
  pox5ContractForNetwork,
  principalAddressVersion,
  principalMatchesNetwork,
  resolveClaimsConfig,
  stacksExplorerContractUrlForConfig,
  traitImplementationUrl,
} from "../src/lib/claims-config";

describe("formatStxFromMicro", () => {
  it("formats whole STX without decimals", () => {
    expect(formatStxFromMicro(2_000_000n)).toBe("2");
  });

  it("trims trailing zeros from fractional STX", () => {
    expect(formatStxFromMicro(250_000n)).toBe("0.25");
  });
});

describe("parseStxToMicro", () => {
  it("round-trips with formatStxFromMicro", () => {
    const micro = 1_234_567n;
    expect(parseStxToMicro(formatStxFromMicro(micro))).toBe(micro);
  });
});

describe("feeMicroForClaimCount", () => {
  it("multiplies claim count by the on-chain rate", () => {
    expect(feeMicroForClaimCount(12n, 250_000n)).toBe(3_000_000n);
  });

  it("returns zero escrow when the on-chain rate is zero", () => {
    expect(feeMicroForClaimCount(12n, 0n)).toBe(0n);
  });
});

describe("parseClaimCount", () => {
  it("prefers an explicit claim count", () => {
    expect(parseClaimCount("12", "", 250_000n)).toBe(12n);
  });

  it("derives claim count from escrow when the rate is known", () => {
    expect(parseClaimCount("", "3", 250_000n)).toBe(12n);
  });

  it("requires an explicit count when the on-chain rate is zero", () => {
    expect(parseClaimCount("", "0", 0n)).toBeNull();
    expect(parseClaimCount("5", "0", 0n)).toBe(5n);
  });
});

describe("defaultApiUrlForNetwork", () => {
  it("returns the known Stacks API for each network", () => {
    expect(defaultApiUrlForNetwork("mainnet")).toBe(
      "https://api.mainnet.hiro.so",
    );
    expect(defaultApiUrlForNetwork("testnet")).toBe(
      "https://api.testnet.hiro.so",
    );
    expect(defaultApiUrlForNetwork("devnet")).toBe("http://localhost:3999");
  });
});

describe("pox5ContractForNetwork", () => {
  it("uses the mainnet boot address on mainnet", () => {
    expect(pox5ContractForNetwork("mainnet")).toBe(
      "SP000000000000000000002Q6VF78.pox-5",
    );
    expect(bootAddressForNetwork("mainnet")).toBe(
      "SP000000000000000000002Q6VF78",
    );
  });

  it("uses the testnet boot address on testnet and devnet", () => {
    expect(pox5ContractForNetwork("testnet")).toBe(
      "ST000000000000000000002AMW42H.pox-5",
    );
    expect(pox5ContractForNetwork("devnet")).toBe(
      "ST000000000000000000002AMW42H.pox-5",
    );
  });
});

describe("isValidContractPrincipal", () => {
  it("accepts fully formed contract principals", () => {
    expect(
      isValidContractPrincipal(
        "ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP.signer-manager-4",
      ),
    ).toBe(true);
    expect(
      isValidContractPrincipal(
        "SP2VMFSHP3EGCZNSQPAA31AJZKS7V70KXY0TT08RF.reward-claim-registry",
      ),
    ).toBe(true);
  });

  it("rejects incomplete or non-contract principals", () => {
    expect(isValidContractPrincipal("ST3TB.signer-manager")).toBe(false);
    expect(isValidContractPrincipal("foo.bar")).toBe(false);
    expect(
      isValidContractPrincipal(
        "ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP.",
      ),
    ).toBe(false);
    expect(isValidContractPrincipal(".signer-manager")).toBe(false);
    expect(
      isValidContractPrincipal("STJYYA9MHWS5Z53WWNZN91AC1M4DB8P59E0YXED9"),
    ).toBe(false);
  });
});

describe("principalAddressVersion", () => {
  it("decodes mainnet and testnet version bytes from c32check addresses", () => {
    expect(
      principalAddressVersion("SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7"),
    ).toBe(22);
    expect(
      principalAddressVersion("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4"),
    ).toBe(20);
    expect(
      principalAddressVersion("ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP"),
    ).toBe(26);
    expect(
      principalAddressVersion("SN3R84XZYA63QS28932XQF3G1J8R9PC3W76P9CSQS"),
    ).toBe(21);
    expect(
      principalAddressVersion(
        "ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP.signer-manager-4",
      ),
    ).toBe(26);
  });

  it("returns null for invalid or incomplete addresses", () => {
    expect(principalAddressVersion("")).toBeNull();
    expect(principalAddressVersion("not-an-address")).toBeNull();
    expect(
      principalAddressVersion("ST2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7"),
    ).toBeNull();
  });
});

describe("principalMatchesNetwork", () => {
  it("treats mainnet version bytes as mainnet and all others as testnet/devnet", () => {
    expect(
      principalMatchesNetwork(
        "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
        "mainnet",
      ),
    ).toBe(true);
    expect(
      principalMatchesNetwork(
        "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
        "mainnet",
      ),
    ).toBe(true);
    expect(
      principalMatchesNetwork(
        "ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP",
        "mainnet",
      ),
    ).toBe(false);
    expect(
      principalMatchesNetwork(
        "ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP.signer-manager",
        "devnet",
      ),
    ).toBe(true);
    expect(
      principalMatchesNetwork(
        "SN3R84XZYA63QS28932XQF3G1J8R9PC3W76P9CSQS",
        "testnet",
      ),
    ).toBe(true);
    expect(principalMatchesNetwork("", "mainnet")).toBeNull();
    expect(principalMatchesNetwork("not-an-address", "mainnet")).toBeNull();
  });
});

describe("resolveClaimsConfig", () => {
  it("reads mainnet when developer mode is off, ignoring stored network overrides", () => {
    const config = resolveClaimsConfig(false, {
      network: "testnet",
      apiUrl: "https://api.testnet.hiro.so",
    });
    expect(config.network).toBe("mainnet");
    expect(config.apiUrl).toBe("https://api.mainnet.hiro.so");
    expect(config.usingOverrides).toBe(false);
  });

  it("uses the selected network's API default when no API override is set", () => {
    const config = resolveClaimsConfig(true, { network: "mainnet" });
    expect(config.network).toBe("mainnet");
    expect(config.apiUrl).toBe("https://api.mainnet.hiro.so");
  });

  it("keeps an explicit API override across network selection", () => {
    const config = resolveClaimsConfig(true, {
      network: "mainnet",
      apiUrl: "https://api.example.test",
    });
    expect(config.apiUrl).toBe("https://api.example.test");
  });

  it("uses the per-network registry contract for the selected network", () => {
    const prevMain = process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_MAINNET;
    const prevTest = process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_TESTNET;
    const prevLegacy = process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT;
    const prevNetwork = process.env.NEXT_PUBLIC_NETWORK;
    process.env.NEXT_PUBLIC_NETWORK = "devnet";
    process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_MAINNET =
      "SP1111111111111111111111111111111111111111.reward-claim-registry";
    process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_TESTNET =
      "ST2222222222222222222222222222222222222222.reward-claim-registry";
    process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT =
      "ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039.reward-claim-registry";
    try {
      expect(claimsContractForNetwork("mainnet")).toBe(
        "SP1111111111111111111111111111111111111111.reward-claim-registry",
      );
      expect(claimsContractForNetwork("testnet")).toBe(
        "ST2222222222222222222222222222222222222222.reward-claim-registry",
      );
      // Legacy only applies to the build network (devnet here).
      expect(claimsContractForNetwork("devnet")).toBe(
        "ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039.reward-claim-registry",
      );

      const mainnet = resolveClaimsConfig(true, { network: "mainnet" });
      expect(mainnet.claimsContract).toBe(
        "SP1111111111111111111111111111111111111111.reward-claim-registry",
      );
      const testnet = resolveClaimsConfig(true, { network: "testnet" });
      expect(testnet.claimsContract).toBe(
        "ST2222222222222222222222222222222222222222.reward-claim-registry",
      );
    } finally {
      if (prevMain === undefined) {
        delete process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_MAINNET;
      } else {
        process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_MAINNET = prevMain;
      }
      if (prevTest === undefined) {
        delete process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_TESTNET;
      } else {
        process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT_TESTNET = prevTest;
      }
      if (prevLegacy === undefined) {
        delete process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT;
      } else {
        process.env.NEXT_PUBLIC_CLAIMS_REGISTRY_CONTRACT = prevLegacy;
      }
      if (prevNetwork === undefined) {
        delete process.env.NEXT_PUBLIC_NETWORK;
      } else {
        process.env.NEXT_PUBLIC_NETWORK = prevNetwork;
      }
    }
  });
});

describe("stacksExplorerContractUrlForConfig", () => {
  const contract =
    "ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039.reward-claim-registry";

  it("builds mainnet explorer links", () => {
    const config = resolveClaimsConfig(true, {
      network: "mainnet",
    });
    expect(stacksExplorerContractUrlForConfig(contract, config)).toBe(
      `https://explorer.hiro.so/txid/${contract}`,
    );
  });

  it("builds testnet explorer links", () => {
    const config = resolveClaimsConfig(true, {
      network: "testnet",
    });
    expect(stacksExplorerContractUrlForConfig(contract, config)).toBe(
      `https://explorer.hiro.so/txid/${contract}?chain=testnet`,
    );
  });

  it("builds devnet explorer links with the configured API", () => {
    const config = resolveClaimsConfig(true, {
      network: "devnet",
    });
    expect(stacksExplorerContractUrlForConfig(contract, config)).toBe(
      `http://localhost:3020/txid/${contract}?chain=testnet&api=http%3A%2F%2Flocalhost%3A3999&ssr=false`,
    );
  });

  it("returns null for malformed contract ids", () => {
    const config = resolveClaimsConfig(false, {});
    expect(stacksExplorerContractUrlForConfig("", config)).toBeNull();
    expect(
      stacksExplorerContractUrlForConfig("not-a-contract", config),
    ).toBeNull();
  });
});

describe("traitImplementationUrl", () => {
  it("builds the node traits RPC path from registry and signer-manager ids", () => {
    const config = resolveClaimsConfig(true, {
      network: "testnet",
      claimsContract:
        "ST205D2HQCZY78TJ57FQN0K74A0FPM4Z9RBXGWAKB.reward-claim-registry",
    });

    expect(
      traitImplementationUrl(
        config,
        "ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP.signer-manager-4",
      ),
    ).toBe(
      "https://api.testnet.hiro.so/v2/traits/ST3TB3AJ0XMZ9S6CGY2CQ6R06H1Z6DJQ1SK5QGMWP/signer-manager-4/ST205D2HQCZY78TJ57FQN0K74A0FPM4Z9RBXGWAKB/reward-claim-registry/reward-claim-signer-manager-trait",
    );
  });
});
