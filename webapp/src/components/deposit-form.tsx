import type { BtcWallet } from "@/components/wallet-provider";
import { ExtLink, Field } from "@/components/ui";
import { STACKS_NETWORK } from "@/lib/constants";
import type { DepositInputs } from "@/lib/deposit";

interface DepositFormProps {
  form: DepositInputs;
  onChange: (patch: Partial<DepositInputs>) => void;
  btcWallet: BtcWallet | null;
  walletWarning: string;
  loading: boolean;
  disabled: boolean;
  error: string;
  onGenerate: () => void;
}

export function DepositForm({
  form,
  onChange,
  btcWallet,
  walletWarning,
  loading,
  disabled,
  error,
  onGenerate,
}: DepositFormProps) {
  return (
    <div
      className={`glass-card p-6 sm:p-8 space-y-6 transition-opacity duration-300 ${disabled ? "opacity-60" : ""}`}
    >
      {/* Stacks Recipient */}
      <Field label="Stacks Recipient">
        <input
          type="text"
          className="input-field font-mono"
          placeholder={
            STACKS_NETWORK === "mainnet" ? "SP... or SM..." : "ST... or SN..."
          }
          value={form.stxAddress}
          readOnly={disabled}
          onChange={(e) => onChange({ stxAddress: e.target.value })}
        />
      </Field>

      {/* Reclaim Method */}
      <Field label="Reclaim Configuration">
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => onChange({ reclaimMode: "pubkey" })}
            disabled={disabled}
            className={`toggle-pill ${form.reclaimMode === "pubkey" ? "toggle-active" : ""}`}
          >
            Public Key
          </button>
          <button
            onClick={() => onChange({ reclaimMode: "script" })}
            disabled={disabled}
            className={`toggle-pill ${form.reclaimMode === "script" ? "toggle-active" : ""}`}
          >
            Custom Script
          </button>
        </div>

        {form.reclaimMode === "pubkey" && (
          <>
            <input
              type="text"
              className="input-field font-mono"
              placeholder="Compressed public key (hex, 33 bytes)"
              value={form.btcPubKey}
              readOnly={disabled}
              onChange={(e) => onChange({ btcPubKey: e.target.value })}
            />
            {btcWallet && form.btcPubKey === btcWallet.publicKey && (
              <p className="text-xs text-sand-500 mt-1.5 font-mono">
                From wallet address: {btcWallet.address}
              </p>
            )}
          </>
        )}
        {form.reclaimMode === "script" && (
          <textarea
            className="input-field font-mono resize-none h-20"
            placeholder="Raw reclaim script in hex"
            value={form.reclaimScriptHex}
            readOnly={disabled}
            onChange={(e) => onChange({ reclaimScriptHex: e.target.value })}
          />
        )}
        <p className="text-xs text-sand-500 mt-2 leading-relaxed">
          {form.reclaimMode === "pubkey" ? (
            <>
              For simple single-sig: enter a compressed public key (33 bytes,
              starting with 02 or 03).{" "}
              <ExtLink href="https://learnmeabitcoin.com/technical/keys/#address">
                Verify
              </ExtLink>{" "}
              that it matches your wallet address.
            </>
          ) : (
            "For multisig or advanced setups: paste the spending condition as hex. It will be appended after <lockTime> OP_CSV — note that CSV leaves a value on the stack, so your script should start with OP_DROP if needed."
          )}
        </p>
        {walletWarning && (
          <div className="badge-warning mt-2">{walletWarning}</div>
        )}
      </Field>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Max Fee (sats)">
          <input
            type="number"
            min="1"
            className="input-field"
            value={form.maxFee}
            readOnly={disabled}
            onChange={(e) => onChange({ maxFee: Number(e.target.value) })}
          />
        </Field>
        <Field label="Lock Time (blocks)">
          <input
            type="number"
            min="1"
            className="input-field"
            value={form.lockTime}
            readOnly={disabled}
            onChange={(e) => onChange({ lockTime: Number(e.target.value) })}
          />
        </Field>
      </div>

      {/* Error */}
      {error && <div className="badge-error">{error}</div>}

      {/* Generate */}
      <button
        onClick={onGenerate}
        disabled={loading || disabled}
        className="btn-primary"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin-slow w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="50 20"
                strokeLinecap="round"
              />
            </svg>
            Generating...
          </span>
        ) : (
          "Generate Deposit Address"
        )}
      </button>
    </div>
  );
}
