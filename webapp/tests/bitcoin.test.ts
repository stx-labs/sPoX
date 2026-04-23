import { describe, expect, it } from "vitest";
import {
  createDepositScript,
  createReclaimScript,
  singleSigSpendScript,
  createDepositAddress,
  disassembleScript,
  scriptToAsm,
  computeTaprootDerivation,
  fromHex,
  toHex,
} from "../src/lib/bitcoin";
import { bech32m } from "@scure/base";

// Deterministic dummy keys (valid compressed pubkey: 0x02 + 32 random-looking bytes)
const COMPRESSED_PUBKEY = fromHex(
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
);
const X_ONLY_PUBKEY = COMPRESSED_PUBKEY.slice(1);

const SIGNERS_KEY = fromHex(
  "03a0b1c2d3e4f5061728394a5b6c7d8e9fa0b1c2d3e4f5061728394a5b6c7d8e9f",
);

// ------- scriptToAsm -------

describe("scriptToAsm", () => {
  it("disassembles a deposit script", () => {
    const recipient = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const script = createDepositScript(SIGNERS_KEY, 80_000, recipient);
    const asm = scriptToAsm(script);
    expect(asm).toContain("DROP");
    expect(asm).toContain("CHECKSIG");
  });

  it("disassembles a reclaim script", () => {
    const script = createReclaimScript(144, singleSigSpendScript(X_ONLY_PUBKEY));
    const asm = scriptToAsm(script);
    expect(asm).toContain("CHECKSEQUENCEVERIFY");
    expect(asm).toContain("CHECKSIG");
  });
});

// ------- disassembleScript -------

describe("disassembleScript", () => {
  it("emits OP_N for lockTime 1..16 without a data field", () => {
    const script = createReclaimScript(7, new Uint8Array([0x51])); // OP_TRUE spend
    const tokens = disassembleScript(script);
    expect(tokens[0].opName).toBe("OP_7");
    expect(tokens[0].data).toBeUndefined();
    expect(tokens[0].opBytes).toEqual(new Uint8Array([0x57])); // OP_7
    expect(tokens[1].opName).toBe("OP_CHECKSEQUENCEVERIFY");
  });

  it("emits OP_PUSHBYTES_N + data for lockTime > 16", () => {
    const script = createReclaimScript(144, new Uint8Array([0x51]));
    const tokens = disassembleScript(script);
    // 144 = 0x90 encoded as CScriptNum (min-encoded) → pushed as 2 bytes
    expect(tokens[0].opName).toBe("OP_PUSHBYTES_2");
    expect(tokens[0].opBytes).toEqual(new Uint8Array([0x02]));
    expect(tokens[0].data).toEqual(new Uint8Array([0x90, 0x00]));
    expect(tokens[1].opName).toBe("OP_CHECKSEQUENCEVERIFY");
  });

  it("disassembles the deposit script into 4 tokens in the expected order", () => {
    const recipient = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const script = createDepositScript(SIGNERS_KEY, 80_000, recipient);
    const tokens = disassembleScript(script);
    expect(tokens.length).toBe(4);
    expect(tokens[0].opName).toMatch(/^OP_PUSHBYTES_\d+$/);
    expect(tokens[0].data).toBeDefined();
    expect(tokens[1].opName).toBe("OP_DROP");
    expect(tokens[1].data).toBeUndefined();
    expect(tokens[2].opName).toBe("OP_PUSHBYTES_32");
    expect(tokens[2].data?.length).toBe(32);
    expect(toHex(tokens[2].data!)).toBe(toHex(SIGNERS_KEY.slice(1))); // x-only
    expect(tokens[3].opName).toBe("OP_CHECKSIG");
  });

  it("renders OP_0 as a plain opcode, not a zero-length push", () => {
    const tokens = disassembleScript(new Uint8Array([0x00]));
    expect(tokens.length).toBe(1);
    expect(tokens[0].opName).toBe("OP_0");
    expect(tokens[0].data).toBeUndefined();
  });

  it("preserves a non-minimal OP_PUSHDATA1 encoding", () => {
    // OP_PUSHDATA1 pushing 2 bytes (non-minimal — OP_PUSHBYTES_2 would suffice).
    const script = new Uint8Array([0x4c, 0x02, 0xab, 0xcd]);
    const tokens = disassembleScript(script);
    expect(tokens.length).toBe(1);
    expect(tokens[0].opName).toBe("OP_PUSHDATA1");
    expect(tokens[0].opBytes).toEqual(new Uint8Array([0x4c, 0x02]));
    expect(tokens[0].data).toEqual(new Uint8Array([0xab, 0xcd]));
  });

  it("accounts for every byte of the input script", () => {
    const recipient = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const script = createDepositScript(SIGNERS_KEY, 80_000, recipient);
    const tokens = disassembleScript(script);
    const consumed = tokens.reduce(
      (acc, t) => acc + t.opBytes.length + (t.data?.length ?? 0),
      0,
    );
    expect(consumed).toBe(script.length);
  });
});

// ------- createReclaimScript minimal push -------

describe("createReclaimScript minimal push", () => {
  const dummySpend = new Uint8Array([0x51]); // OP_TRUE

  it("uses OP_1 for lockTime 1 (not OP_PUSHBYTES_1 0x01)", () => {
    const script = createReclaimScript(1, dummySpend);
    // OP_1 = 0x51, OP_CSV = 0xb2
    expect(script[0]).toBe(0x51);
    expect(script[1]).toBe(0xb2);
  });

  it("uses OP_16 for lockTime 16", () => {
    const script = createReclaimScript(16, dummySpend);
    // OP_16 = 0x60, OP_CSV = 0xb2
    expect(script[0]).toBe(0x60);
    expect(script[1]).toBe(0xb2);
  });

  it("uses a data push for lockTime 17", () => {
    const script = createReclaimScript(17, dummySpend);
    // OP_PUSHBYTES_1 = 0x01, 0x11 = 17, OP_CSV = 0xb2
    expect(script[0]).toBe(0x01);
    expect(script[1]).toBe(0x11);
    expect(script[2]).toBe(0xb2);
  });
});

// ------- computeTaprootDerivation -------

describe("computeTaprootDerivation", () => {
  it("tweaked key matches the generated deposit address", () => {
    const recipient = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const depositScript = createDepositScript(SIGNERS_KEY, 80_000, recipient);
    const reclaimScript = createReclaimScript(144, singleSigSpendScript(X_ONLY_PUBKEY));

    const address = createDepositAddress(depositScript, reclaimScript, "regtest");
    const derivation = computeTaprootDerivation(depositScript, reclaimScript);

    // Extract the witness program (x-only key) from the generated address
    const decoded = bech32m.decode(address as `${string}1${string}`, 110);
    const witnessPubkey = bech32m.fromWords(decoded.words.slice(1));

    // The derivation's tweaked key should match
    expect(derivation.tweakedKey).toBe(
      Array.from(witnessPubkey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
  });
});

// ------- Known deposit address vector -------

describe("known deposit address", () => {
  it("matches expected bcrt1p address for given parameters", () => {
    const signersXonly = fromHex(
      "37133bde8a28c0c89e0ca0fd844b38a7668010a9da0567eb94240e4b5f2cde87",
    );
    const recipient = "ST2FQWJMF9CGPW34ZWK8FEPNK072NEV1VKRNBBMJ9";
    const maxFee = 5_000;
    const lockTime = 100;
    const customSpendScript = fromHex("7551"); // OP_DROP OP_TRUE

    const depositScript = createDepositScript(signersXonly, maxFee, recipient);
    const reclaimScript = createReclaimScript(lockTime, customSpendScript);
    const address = createDepositAddress(depositScript, reclaimScript, "regtest");

    expect(address).toBe(
      "bcrt1p7t0emhscws6eplmtmq0lhpgds5x37vxhrr27aqrr90g76rg7m36q44zhsa",
    );
  });
});
