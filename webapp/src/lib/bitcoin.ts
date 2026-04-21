import { p2tr, Script, ScriptNum, NETWORK as BTC_MAINNET } from "@scure/btc-signer";
import { hex } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Cl } from "@stacks/transactions";
import { NUMS_X_COORDINATE, BTC_NETWORK } from "./constants";

const BTC_REGTEST: typeof BTC_MAINNET = {
  bech32: "bcrt",
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

/** Strip the 0x02/0x03 prefix from a 33-byte compressed pubkey to get 32-byte x-only. */
export function toXOnly(pubkey: Uint8Array): Uint8Array {
  return pubkey.length === 33 ? pubkey.slice(1) : pubkey;
}

/**
 * Build the sBTC deposit script.
 *
 * Layout: <8-byte BE maxFee ++ Clarity-serialized recipient> OP_DROP <signersPubKey> OP_CHECKSIG
 */
export function createDepositScript(
  signersPubKey: Uint8Array,
  maxFee: number,
  recipientAddress: string,
): Uint8Array {
  const serialized = Cl.serialize(Cl.principal(recipientAddress));
  const recipientBytes =
    typeof serialized === "string"
      ? fromHex(serialized)
      : (serialized as unknown as Uint8Array);

  const maxFeeBytes = new Uint8Array(8);
  new DataView(maxFeeBytes.buffer).setBigUint64(0, BigInt(maxFee));

  const opDropData = new Uint8Array(
    maxFeeBytes.length + recipientBytes.length,
  );
  opDropData.set(maxFeeBytes);
  opDropData.set(recipientBytes, maxFeeBytes.length);

  const xOnlyKey = toXOnly(signersPubKey);

  return Script.encode([opDropData, "DROP", xOnlyKey, "CHECKSIG"]);
}

/**
 * Build a reclaim script with the common CSV prefix followed by a spending condition.
 *
 * Layout: <lockTime> OP_CHECKSEQUENCEVERIFY <...spendScript>
 *
 * The spendScript is appended raw after the prefix: for single-sig this is
 * `OP_DROP <x-only pubkey> OP_CHECKSIG`, for custom scripts it's whatever the user provides.
 */
export function createReclaimScript(
  lockTime: number,
  spendScript: Uint8Array,
): Uint8Array {
  // Minimal push encoding (required by tapscript/BIP 342 MINIMALDATA):
  // values 0–16 must use OP_0/OP_1–OP_16 instead of a data push.
  const OP_CSV = 0xb2;
  let prefix: Uint8Array;
  if (lockTime === 0) {
    prefix = new Uint8Array([0x00, OP_CSV]); // OP_0 OP_CSV
  } else if (lockTime <= 16) {
    prefix = new Uint8Array([0x50 + lockTime, OP_CSV]); // OP_1-OP_16 OP_CSV
  } else {
    prefix = Script.encode([
      ScriptNum().encode(BigInt(lockTime)),
      "CHECKSEQUENCEVERIFY",
    ]);
  }
  const result = new Uint8Array(prefix.length + spendScript.length);
  result.set(prefix);
  result.set(spendScript, prefix.length);
  return result;
}

/** Build the single-sig spend condition: OP_DROP <x-only pubkey> OP_CHECKSIG */
export function singleSigSpendScript(pubkey: Uint8Array): Uint8Array {
  return Script.encode(["DROP", toXOnly(pubkey), "CHECKSIG"]);
}

/**
 * Derive the P2TR deposit address from the deposit and reclaim scripts,
 * using the NUMS unspendable internal key.
 */
export function createDepositAddress(
  depositScript: Uint8Array,
  reclaimScript: Uint8Array,
  network: string = BTC_NETWORK,
): string {
  if (network !== "mainnet" && network !== "regtest") {
    throw new Error(`Unsupported network "${network}". Only mainnet and regtest are supported.`);
  }
  const net = network === "mainnet" ? BTC_MAINNET : BTC_REGTEST;

  const result = p2tr(
    NUMS_X_COORDINATE,
    [{ script: depositScript }, { script: reclaimScript }],
    net,
    true, // allowUnknownOutputs — deposit/reclaim are custom sBTC scripts
  );

  if (!result.address) throw new Error("Failed to derive P2TR address");
  return result.address;
}

// ---- Script disassembly ----

/** Disassemble a compiled Bitcoin script into human-readable ASM. */
export function scriptToAsm(compiled: Uint8Array): string {
  const decoded = Script.decode(compiled);
  return decoded
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "number")
        return `0x${item.toString(16).padStart(2, "0")}`;
      if (item instanceof Uint8Array) return hex.encode(item);
      return String(item);
    })
    .join(" ");
}

/**
 * A single disassembled script token: either a push (with data bytes + the
 * prefix bytes used to encode the push length) or a plain opcode.
 */
export interface ScriptToken {
  /** Display name: OP_PUSHBYTES_<N>, OP_PUSHDATA<N>, OP_<N>, OP_DROP, … */
  opName: string;
  /** Bytes occupied by the opcode itself (1 for most, 2–5 for PUSHDATA). */
  opBytes: Uint8Array;
  /** Present for data pushes; the raw bytes pushed onto the stack. */
  data?: Uint8Array;
}

/**
 * Return the opcode name and prefix length used by a push-data instruction.
 * Reads the actual push opcode from the script so non-minimal encodings
 * (e.g. OP_PUSHDATA1 used for a 10-byte push) are preserved.
 */
function readPushPrefix(byte: number): { name: string; prefixLen: number } {
  if (byte >= 0x01 && byte <= 0x4b) {
    return { name: `OP_PUSHBYTES_${byte}`, prefixLen: 1 };
  }
  if (byte === 0x4c) return { name: "OP_PUSHDATA1", prefixLen: 2 };
  if (byte === 0x4d) return { name: "OP_PUSHDATA2", prefixLen: 3 };
  if (byte === 0x4e) return { name: "OP_PUSHDATA4", prefixLen: 5 };
  throw new Error(
    `not a push opcode: 0x${byte.toString(16).padStart(2, "0")}`,
  );
}

/**
 * Walk a compiled script, yielding one `ScriptToken` per opcode or data push.
 * Unlike `scriptToAsm`, this preserves push-opcode boundaries (so a 32-byte
 * data push shows up as `OP_PUSHBYTES_32` followed by its data, rather than
 * just the hex).
 *
 * Leans on `Script.decode` from `@scure/btc-signer` for the opcode name
 * table; the push-prefix accounting reads raw bytes so non-minimal pushes
 * are preserved. As a safety net, the total size of the emitted tokens is
 * compared against the input script length at the end — any mismatch means
 * we've drifted and throws rather than silently misrendering.
 */
export function disassembleScript(script: Uint8Array): ScriptToken[] {
  const decoded = Script.decode(script);
  const tokens: ScriptToken[] = [];
  let i = 0;
  for (const item of decoded) {
    if (item instanceof Uint8Array) {
      // scure represents OP_0 as an empty Uint8Array; the byte itself (0x00)
      // is not a push opcode, so treat it as a plain opcode.
      if (item.length === 0 && script[i] === 0x00) {
        tokens.push({ opName: "OP_0", opBytes: script.slice(i, i + 1) });
        i += 1;
        continue;
      }
      const { name, prefixLen } = readPushPrefix(script[i]);
      tokens.push({
        opName: name,
        opBytes: script.slice(i, i + prefixLen),
        data: script.slice(i + prefixLen, i + prefixLen + item.length),
      });
      i += prefixLen + item.length;
    } else if (typeof item === "string") {
      // scure returns names like "DROP", "CHECKSIG" (no prefix) and "OP_0",
      // "OP_1" etc (already prefixed).
      tokens.push({
        opName: item.startsWith("OP_") ? item : `OP_${item}`,
        opBytes: script.slice(i, i + 1),
      });
      i += 1;
    } else {
      // scure decoded the opcode as a number — currently only OP_1..OP_16
      // (bytes 0x51..0x60) land here; other unknown opcode bytes fall through
      // to `OP_UNKNOWN_0xNN`. Recover the display name from the raw byte
      // rather than trusting the decoded value.
      const byte = script[i];
      let opName: string;
      if (byte === 0x00) opName = "OP_0";
      else if (byte >= 0x51 && byte <= 0x60) opName = `OP_${byte - 0x50}`;
      else if (byte === 0x4f) opName = "OP_1NEGATE";
      else opName = `OP_UNKNOWN_0x${byte.toString(16).padStart(2, "0")}`;
      tokens.push({ opName, opBytes: script.slice(i, i + 1) });
      i += 1;
    }
  }

  // Invariant: every byte of the input script must be accounted for by
  // exactly one token (either in opBytes or data).
  const consumed = tokens.reduce(
    (acc, t) => acc + t.opBytes.length + (t.data?.length ?? 0),
    0,
  );
  if (consumed !== script.length) {
    throw new Error(
      `disassembleScript: consumed ${consumed} bytes of a ${script.length}-byte script`,
    );
  }

  return tokens;
}

// ---- Taproot derivation ----

function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const buf = new Uint8Array(tagHash.length * 2 + data.length);
  buf.set(tagHash, 0);
  buf.set(tagHash, tagHash.length);
  buf.set(data, tagHash.length * 2);
  return sha256(buf);
}

function compactSize(n: number): Uint8Array {
  if (n < 253) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  throw new Error("Script too large for compact size");
}

function tapLeafHash(script: Uint8Array, leafVersion = 0xc0): Uint8Array {
  const cs = compactSize(script.length);
  const data = new Uint8Array(1 + cs.length + script.length);
  data[0] = leafVersion;
  data.set(cs, 1);
  data.set(script, 1 + cs.length);
  return taggedHash("TapLeaf", data);
}

function tapBranchHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  let first = a,
    second = b;
  for (let i = 0; i < 32; i++) {
    if (a[i] < b[i]) break;
    if (a[i] > b[i]) {
      first = b;
      second = a;
      break;
    }
  }
  const data = new Uint8Array(64);
  data.set(first, 0);
  data.set(second, 32);
  return taggedHash("TapBranch", data);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let r = 0n;
  for (const b of bytes) r = (r << 8n) | BigInt(b);
  return r;
}

export interface TaprootDerivation {
  depositLeafHash: string;
  reclaimLeafHash: string;
  branchHash: string;
  internalKey: string;
  tweak: string;
  tweakDecimal: string;
  liftedKeyX: string;
  liftedKeyY: string;
  tweakedKey: string;
  tweakedKeyX: string;
  tweakedKeyY: string;
}

/**
 * Compute all intermediate values of the P2TR address derivation from the
 * two leaf scripts, so the user can independently verify each step.
 */
export function computeTaprootDerivation(
  depositScript: Uint8Array,
  reclaimScript: Uint8Array,
): TaprootDerivation {
  const depositLeaf = tapLeafHash(depositScript);
  const reclaimLeaf = tapLeafHash(reclaimScript);
  const branch = tapBranchHash(depositLeaf, reclaimLeaf);

  const internalKey = NUMS_X_COORDINATE;

  // TapTweak = tagged_hash("TapTweak", internal_key || merkle_root)
  const tweakInput = new Uint8Array(64);
  tweakInput.set(internalKey, 0);
  tweakInput.set(branch, 32);
  const tweak = taggedHash("TapTweak", tweakInput);

  // tweaked_key = lift_x(internal_key) + tweak * G
  const P = secp256k1.Point.fromHex("02" + hex.encode(internalKey));
  const tweakScalar = bytesToBigInt(tweak);
  const T = secp256k1.Point.BASE.multiply(tweakScalar);
  const Q = P.add(T);
  const tweakedKey = hex.decode(Q.toHex(true)).slice(1); // x-only

  return {
    depositLeafHash: hex.encode(depositLeaf),
    reclaimLeafHash: hex.encode(reclaimLeaf),
    branchHash: hex.encode(branch),
    internalKey: hex.encode(internalKey),
    tweak: hex.encode(tweak),
    tweakDecimal: tweakScalar.toString(10),
    liftedKeyX: P.x.toString(10),
    liftedKeyY: P.y.toString(10),
    tweakedKey: hex.encode(tweakedKey),
    tweakedKeyX: Q.x.toString(10),
    tweakedKeyY: Q.y.toString(10),
  };
}

// ---- Hex helpers ----

/** Encode bytes as hex string. */
export function toHex(bytes: Uint8Array): string {
  return hex.encode(bytes);
}

/** Decode hex string to bytes (strips optional 0x prefix). */
export function fromHex(h: string): Uint8Array {
  return hex.decode(h.replace(/^0x/, ""));
}
