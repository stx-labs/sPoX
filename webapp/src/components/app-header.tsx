import { ConnectButton } from "@/components/connect-button";
import { STACKS_NETWORK } from "@/lib/constants";

export function AppHeader() {
  return (
    <div className="flex items-center justify-between mb-10">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, var(--color-accent-orange), var(--color-accent-coral))",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-sand-50">
            sBTC Autobridge
          </h1>
        </div>
        <span className="network-badge">{STACKS_NETWORK}</span>
      </div>
      <ConnectButton />
    </div>
  );
}
