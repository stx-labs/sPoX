import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  /**
   * Element id of the control this field labels. Required for screen readers
   * to link the label to the underlying input/textarea.
   */
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-sand-400 mb-2 uppercase tracking-wider"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function DerivationCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="derivation-card">
      <p className="text-xs font-semibold text-sand-300 mb-2">{label}</p>
      {children}
    </div>
  );
}

export function HexRow({
  label,
  value,
  accent,
}: {
  label?: ReactNode;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="mt-1">
      {label && <span className="text-xs text-sand-500">{label}</span>}
      <code
        className={`block text-xs font-mono break-all leading-relaxed ${accent ? "text-accent-orange" : "text-sand-300"}`}
      >
        {value}
      </code>
    </div>
  );
}

export function AsmRow({ value }: { value: ReactNode }) {
  return (
    <div className="mt-1">
      <span className="text-xs text-sand-500">ASM</span>
      <code className="block text-xs font-mono text-sand-200 break-all leading-relaxed">
        {value}
      </code>
    </div>
  );
}

export function ExtLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-sand-600 hover:decoration-accent-orange/50 transition-colors"
    >
      {children}
    </a>
  );
}

export function Arrow() {
  return (
    <div className="flex justify-center py-1.5 text-sand-600">
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
        <path
          d="M8 0v16m0 0l-5-5m5 5l5-5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
