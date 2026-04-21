"use client";

import { useCallback, useState } from "react";
import { DerivationDetails } from "@/components/derivation-details";
import { ExtLink } from "@/components/ui";
import { stacksExplorerTxUrl } from "@/lib/constants";
import type { GeneratedResult } from "@/lib/deposit";

interface ResultCardProps {
  result: GeneratedResult;
  maxFee: number;
  txId: string | null;
  registerError: string;
  onRegister: () => void;
  onReset: () => void;
}

export function ResultCard({
  result,
  maxFee,
  txId,
  registerError,
  onRegister,
  onReset,
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(result.depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  return (
    <div className="glass-card p-6 sm:p-8 space-y-6 mt-4">
      {/* Deposit Address */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-sand-200">
            Deposit Address
          </h2>
          <div className="flex-1 h-px bg-sand-700/50" />
        </div>
        <p className="text-xs text-sand-500 mb-3">
          <strong className="text-sand-300">Once you register it</strong> on
          the smart contract below, any BTC sent to this address will be
          autobridged to sBTC.
        </p>
        <div className="flex items-start gap-2">
          <code className="address-highlight flex-1">
            {result.depositAddress}
          </code>
          <button
            onClick={copyAddress}
            className="btn-secondary shrink-0 !py-3"
          >
            {copied ? (
              <span className="flex items-center gap-1.5 text-success">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Copied
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy
              </span>
            )}
          </button>
        </div>
      </div>

      <DerivationDetails result={result} />

      {/* Try it out hint */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70 space-y-2">
        <p className="font-semibold text-white/90">Want to try it out?</p>
        <p>
          <strong className="text-white/90">
            Once you&apos;ve registered the address
          </strong>{" "}
          on the smart contract below — and before switching your PoX reward
          address to it — you can test the flow end-to-end by sending{" "}
          <strong className="text-white/90">
            {Math.max(10000, maxFee).toLocaleString()} sats
          </strong>{" "}
          to the deposit address. They&apos;ll be picked up and converted to
          sBTC.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="badge-warning">
        <strong>Important:</strong> This only registers the deposit address for
        monitoring — it does not update your PoX reward address. You need to
        set your reward address separately via your stacking setup. See the{" "}
        <ExtLink href="https://docs.stacks.co/guides-and-tutorials/stack-stx">
          Stacks PoX guide
        </ExtLink>{" "}
        for details.
      </div>

      {registerError && <div className="badge-error">{registerError}</div>}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onRegister} className="btn-register flex-1">
          Register on Smart Contract
        </button>
        <button
          onClick={onReset}
          className="btn-secondary !text-sand-400 hover:!text-sand-200"
        >
          <span className="flex items-center gap-1.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
            </svg>
            Start Over
          </span>
        </button>
      </div>

      {txId && (
        <>
          <div className="badge-success">
            Transaction submitted:{" "}
            <a
              href={stacksExplorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs underline decoration-success/50 hover:decoration-success transition-colors"
            >
              {txId}
            </a>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70 space-y-2">
            <p className="font-semibold text-white/90">What&apos;s next?</p>
            <p>
              Once the transaction is confirmed, the system will monitor for
              BTC deposits to your registered address. When a deposit is
              detected, it will automatically create the deposit on Emily and
              the sBTC signers will process it — assuming the max fee and lock
              time allow its fulfillment.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
