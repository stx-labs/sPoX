"use client";

import { useState } from "react";
import { useWallet } from "@/components/wallet-provider";

export function ConnectButton() {
  const { connected, stxAddress, connect, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);

  if (connected && stxAddress) {
    const onCopy = () => {
      navigator.clipboard.writeText(stxAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="flex items-center gap-3">
        <div
          className="group flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200"
          style={{ background: "rgba(52, 211, 153, 0.08)", border: "1px solid rgba(52, 211, 153, 0.2)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          <span className="text-xs text-sand-300 font-mono">
            <span className="group-hover:hidden">
              {stxAddress.slice(0, 6)}...{stxAddress.slice(-4)}
            </span>
            <span className="hidden group-hover:inline">{stxAddress}</span>
          </span>
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy address"
            className="hidden group-hover:flex items-center justify-center text-sand-400 hover:text-sand-200 transition-colors cursor-pointer"
          >
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        </div>
        <button
          onClick={disconnect}
          className="btn-secondary !py-1.5 !px-3 !text-xs"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      className="btn-secondary !border-accent-orange/25 !text-accent-orange hover:!bg-accent-orange/5 font-medium"
    >
      Connect Wallet
    </button>
  );
}
