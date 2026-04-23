import type { ReactNode } from "react";
import { disassembleScript, toHex, type ScriptToken } from "@/lib/bitcoin";
import type { GeneratedResult } from "@/lib/deposit";
import {
  Arrow,
  AsmRow,
  DerivationCard,
  ExtLink,
  HexRow,
} from "@/components/ui";

// Color legend used by the bullet-point breakdown, the hex rendering, and the
// ASM rendering — all three share these classes so the three views line up.
const COLOR_MAX_FEE = "text-success";
const COLOR_RECIPIENT = "text-warning";
const COLOR_SIGNERS = "text-accent-coral";
const COLOR_LOCKTIME = "text-success";
const COLOR_SPEND = "text-warning";
// Push opcodes (OP_PUSHBYTES_*, OP_PUSHDATA*) — structural glue, not a value.
const COLOR_STRUCTURAL = "text-sand-500";

function Swatch({ className }: { className: string }) {
  // Derive `--color-<token>` from `text-<token>` so the swatch matches the
  // text color. Using inline style (rather than a `bg-<token>` utility)
  // avoids Tailwind v4's JIT missing dynamically-constructed class names.
  const token = className.replace(/^text-/, "");
  return (
    <span
      className="inline-block w-2 h-2 rounded-full align-middle mr-1.5"
      style={{ backgroundColor: `var(--color-${token})` }}
    />
  );
}

/**
 * A `ScriptToken` plus the colors we want to apply when rendering it. Both
 * the hex and ASM views consume the same `DisplayToken[]`, so the two views
 * are guaranteed to line up colour-wise.
 */
interface DisplayToken extends ScriptToken {
  /** Class applied to the opcode name (in ASM) and opcode bytes (in hex). */
  opColor?: string;
  /** Optional sub-ranges within `data`. Unlabeled when absent. */
  dataRanges?: { bytes: number; color?: string }[];
}

/**
 * Single-pass renderer shared by the hex and ASM views. `renderOp` decides
 * what to show for each token's opcode (hex bytes vs. name); data ranges are
 * always rendered as hex chunks. The optional `separator` is inserted between
 * tokens and between an op and its data — set it for ASM, omit for hex.
 */
function renderTokens(
  tokens: DisplayToken[],
  renderOp: (t: DisplayToken) => string,
  separator?: string,
): ReactNode {
  const parts: ReactNode[] = [];
  tokens.forEach((t, ti) => {
    if (separator && ti > 0) parts.push(separator);
    parts.push(
      <span key={`op-${ti}`} className={t.opColor}>
        {renderOp(t)}
      </span>,
    );
    if (t.data && t.data.length > 0) {
      if (separator) parts.push(separator);
      const ranges = t.dataRanges ?? [{ bytes: t.data.length }];
      let offset = 0;
      ranges.forEach((r, ri) => {
        const chunk = t.data!.slice(offset, offset + r.bytes);
        offset += r.bytes;
        parts.push(
          <span key={`d-${ti}-${ri}`} className={r.color}>
            {toHex(chunk)}
          </span>,
        );
      });
    }
  });
  return <>{parts}</>;
}

function HexFromTokens({ tokens }: { tokens: DisplayToken[] }) {
  return renderTokens(tokens, (t) => toHex(t.opBytes));
}

function AsmFromTokens({ tokens }: { tokens: DisplayToken[] }) {
  return renderTokens(tokens, (t) => t.opName, " ");
}

/**
 * Deposit script shape (always 4 tokens):
 *   [0] OP_PUSHBYTES_<N>  data: <8-byte maxFee> <recipient>
 *   [1] OP_DROP
 *   [2] OP_PUSHBYTES_32   data: <signers x-only pubkey>
 *   [3] OP_CHECKSIG
 *
 * If the script doesn't match that shape (e.g. format drift), fall back to
 * rendering without colors rather than silently mislabeling bytes.
 */
function colorDeposit(tokens: ScriptToken[]): DisplayToken[] {
  const shapeMatches =
    tokens.length === 4 &&
    tokens[0].data !== undefined &&
    tokens[0].data.length >= 8 &&
    tokens[1].opName === "OP_DROP" &&
    tokens[2].data?.length === 32 &&
    tokens[3].opName === "OP_CHECKSIG";
  if (!shapeMatches) return tokens;

  return tokens.map((t, i): DisplayToken => {
    if (i === 0 && t.data) {
      return {
        ...t,
        opColor: COLOR_STRUCTURAL,
        dataRanges: [
          { bytes: 8, color: COLOR_MAX_FEE },
          { bytes: t.data.length - 8, color: COLOR_RECIPIENT },
        ],
      };
    }
    if (i === 2 && t.data) {
      return {
        ...t,
        opColor: COLOR_STRUCTURAL,
        dataRanges: [{ bytes: t.data.length, color: COLOR_SIGNERS }],
      };
    }
    return t;
  });
}

/**
 * Reclaim script shape:
 *   [0] <lockTime>               either OP_0/OP_N (value in the opcode itself)
 *                                 or OP_PUSHBYTES_<n> with value in data
 *   [1] OP_CHECKSEQUENCEVERIFY
 *   [2..] spend script           arbitrary (single-sig or user-provided)
 *
 * If the script doesn't start with `<lockTime> OP_CHECKSEQUENCEVERIFY`, fall
 * back to rendering without colors rather than silently mislabeling bytes.
 */
function colorReclaim(tokens: ScriptToken[]): DisplayToken[] {
  const shapeMatches =
    tokens.length >= 2 && tokens[1].opName === "OP_CHECKSEQUENCEVERIFY";
  if (!shapeMatches) return tokens;

  return tokens.map((t, i): DisplayToken => {
    if (i === 0) {
      if (t.data) {
        return {
          ...t,
          opColor: COLOR_STRUCTURAL,
          dataRanges: [{ bytes: t.data.length, color: COLOR_LOCKTIME }],
        };
      }
      return { ...t, opColor: COLOR_LOCKTIME };
    }
    if (i === 1) {
      // OP_CSV — opcode stays default.
      return t;
    }
    // Spend script: push opcodes are structural, data is the "spend condition"
    // hue, plain opcodes stay default.
    if (t.data) {
      return {
        ...t,
        opColor: COLOR_STRUCTURAL,
        dataRanges: [{ bytes: t.data.length, color: COLOR_SPEND }],
      };
    }
    return t;
  });
}

export function DerivationDetails({ result }: { result: GeneratedResult }) {
  const depositTokens = colorDeposit(disassembleScript(result.depositScript));
  const reclaimTokens = colorReclaim(disassembleScript(result.reclaimScript));

  return (
    <details className="group">
      <summary className="flex items-center gap-2 text-sm font-medium text-sand-400 cursor-pointer hover:text-sand-300 transition-colors select-none">
        <svg
          className="w-3.5 h-3.5 transition-transform group-open:rotate-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Verify Scripts &amp; Address Derivation
      </summary>
      <div className="mt-5 flex flex-col items-center gap-0">
        {/* Leaf scripts side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          <DerivationCard label="Deposit Script (leaf 0)">
            <p className="text-xs text-sand-500 mb-2">
              Commits the deposit to a recipient and the current signers key:
            </p>
            <ul className="text-xs text-sand-400 space-y-0.5 mb-2.5">
              <li>
                <Swatch className={COLOR_MAX_FEE} />
                <span className={COLOR_MAX_FEE}>max fee</span>{" "}
                <span className="text-sand-500">(8 bytes, big-endian)</span>
              </li>
              <li>
                <Swatch className={COLOR_RECIPIENT} />
                <span className={COLOR_RECIPIENT}>sBTC recipient</span>{" "}
                <span className="text-sand-500">(Clarity-serialized principal)</span>
              </li>
              <li>
                <Swatch className={COLOR_SIGNERS} />
                <span className={COLOR_SIGNERS}>sBTC signers x-only pubkey</span>{" "}
                <span className="text-sand-500">(32 bytes)</span>
              </li>
            </ul>
            <HexRow
              label="Hex"
              value={<HexFromTokens tokens={depositTokens} />}
            />
            <AsmRow value={<AsmFromTokens tokens={depositTokens} />} />
            <HexRow
              label={
                <>
                  <ExtLink href="https://learnmeabitcoin.com/technical/upgrades/taproot/#script-tree-merkle-root-leaf-hash">
                    tagged_hash
                  </ExtLink>
                  (&quot;TapLeaf&quot;, 0xc0 ‖ 0x
                  {result.depositScript.length.toString(16).padStart(2, "0")} ‖
                  script)
                </>
              }
              value={result.derivation.depositLeafHash}
              accent
            />
          </DerivationCard>
          <DerivationCard label="Reclaim Script (leaf 1)">
            <p className="text-xs text-sand-500 mb-2">
              Lets the sender reclaim the deposit after a timelock:
            </p>
            <ul className="text-xs text-sand-400 space-y-0.5 mb-2.5">
              <li>
                <Swatch className={COLOR_LOCKTIME} />
                <span className={COLOR_LOCKTIME}>lock time</span>{" "}
                <span className="text-sand-500">(blocks before reclaim is allowed, enforced by OP_CSV)</span>
              </li>
              <li>
                <Swatch className={COLOR_SPEND} />
                <span className={COLOR_SPEND}>spend condition</span>{" "}
                <span className="text-sand-500">(single-sig or custom script)</span>
              </li>
            </ul>
            <HexRow
              label="Hex"
              value={<HexFromTokens tokens={reclaimTokens} />}
            />
            <AsmRow value={<AsmFromTokens tokens={reclaimTokens} />} />
            <HexRow
              label={
                <>
                  <ExtLink href="https://learnmeabitcoin.com/technical/upgrades/taproot/#script-tree-merkle-root-leaf-hash">
                    tagged_hash
                  </ExtLink>
                  (&quot;TapLeaf&quot;, 0xc0 ‖ 0x
                  {result.reclaimScript.length.toString(16).padStart(2, "0")} ‖
                  script)
                </>
              }
              value={result.derivation.reclaimLeafHash}
              accent
            />
          </DerivationCard>
        </div>

        <Arrow />

        <DerivationCard label="Branch Hash">
          <p className="text-xs text-sand-500">
            <ExtLink href="https://learnmeabitcoin.com/technical/upgrades/taproot/#script-tree-merkle-root-branch-hash">
              tagged_hash
            </ExtLink>
            (&quot;TapBranch&quot;, sort(
          </p>
          {(() => {
            const [a, b] = [
              result.derivation.depositLeafHash,
              result.derivation.reclaimLeafHash,
            ].sort();
            return (
              <>
                <code className="block text-xs font-mono text-sand-400 break-all pl-3">
                  {a},
                </code>
                <code className="block text-xs font-mono text-sand-400 break-all pl-3">
                  {b}
                </code>
              </>
            );
          })()}
          <p className="text-xs text-sand-500">))</p>
          <HexRow value={result.derivation.branchHash} accent />
        </DerivationCard>

        <Arrow />

        <DerivationCard label="Taproot Tweak">
          <HexRow
            label={
              <>
                Internal key (
                <ExtLink href="https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki#constructing-and-spending-taproot-outputs">
                  NUMS
                </ExtLink>
                )
              </>
            }
            value={result.derivation.internalKey}
          />
          <p className="text-xs text-sand-500 mt-1.5">
            <ExtLink href="https://learnmeabitcoin.com/technical/upgrades/taproot/#tweak">
              tagged_hash
            </ExtLink>
            (&quot;TapTweak&quot;, internal_key ‖ branch_hash)
          </p>
          <HexRow value={`0x${result.derivation.tweak}`} accent />
          <HexRow value={`0d${result.derivation.tweakDecimal}`} accent />
        </DerivationCard>

        <Arrow />

        <DerivationCard label="Tweaked Public Key">
          <p className="text-xs text-sand-500">lift_x(NUMS)</p>
          <code className="block text-xs font-mono text-sand-300 break-all mt-1">
            (0d{result.derivation.liftedKeyX},
          </code>
          <code className="block text-xs font-mono text-sand-300 break-all pl-1">
            0d{result.derivation.liftedKeyY})
          </code>
          <p className="text-xs text-sand-500 mt-1.5">
            <ExtLink href="https://learnmeabitcoin.com/technical/upgrades/taproot/#tweaked-public-key">
              lift_x(NUMS) + tweak &times; G
            </ExtLink>
          </p>
          <code className="block text-xs font-mono text-accent-orange break-all mt-1">
            (0d{result.derivation.tweakedKeyX},
          </code>
          <code className="block text-xs font-mono text-accent-orange break-all pl-1">
            0d{result.derivation.tweakedKeyY})
          </code>
          <p className="text-xs text-sand-500 mt-1.5">x-only</p>
          <HexRow value={`0x${result.derivation.tweakedKey}`} accent />
        </DerivationCard>

        <Arrow />

        <DerivationCard label="Deposit Address">
          <p className="text-xs text-sand-500">
            <ExtLink href="https://learnmeabitcoin.com/technical/upgrades/taproot/#scriptpubkey">
              bech32m
            </ExtLink>
            (witness_v1, tweaked_key)
          </p>
          <code className="block text-xs font-mono text-accent-orange mt-1.5 break-all">
            {result.depositAddress}
          </code>
        </DerivationCard>
      </div>
    </details>
  );
}
