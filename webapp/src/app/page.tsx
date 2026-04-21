"use client";

import { useCallback, useEffect, useState } from "react";
import { request } from "@stacks/connect";
import { Cl } from "@stacks/transactions";
import { AppHeader } from "@/components/app-header";
import { DepositForm } from "@/components/deposit-form";
import { ResultCard } from "@/components/result-card";
import { useWallet } from "@/components/wallet-provider";
import {
  DEFAULT_MAX_FEE,
  DEFAULT_LOCK_TIME,
  REGISTRY_CONTRACT,
  STACKS_NETWORK,
} from "@/lib/constants";
import {
  generateDeposit,
  validateDepositInputs,
  type DepositInputs,
  type GeneratedResult,
} from "@/lib/deposit";

const INITIAL_FORM: DepositInputs = {
  stxAddress: "",
  reclaimMode: "pubkey",
  btcPubKey: "",
  reclaimScriptHex: "",
  maxFee: DEFAULT_MAX_FEE,
  lockTime: DEFAULT_LOCK_TIME,
};

export default function Home() {
  const {
    connected,
    stxAddress: walletStxAddress,
    btcWallet,
  } = useWallet();

  const [form, setForm] = useState<DepositInputs>(INITIAL_FORM);
  const patchForm = useCallback((patch: Partial<DepositInputs>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [txId, setTxId] = useState<string | null>(null);
  const [walletWarning, setWalletWarning] = useState("");

  // Auto-fill from wallet.
  //
  // `result` is read as a gate but deliberately not a dependency: if it were,
  // Reset (which clears `result`) would re-run the effect and overwrite any
  // edits the user made to the form. We only want the effect to fire when
  // the wallet connection itself changes.
  useEffect(() => {
    if (!connected) return;
    setWalletWarning("");

    if (result) {
      setWalletWarning(
        "Wallet connected but fields were not updated because a deposit address is already generated. Refresh the page to start over with the wallet fields auto-filled.",
      );
      return;
    }

    if (walletStxAddress) patchForm({ stxAddress: walletStxAddress });

    if (btcWallet) {
      patchForm({ reclaimMode: "pubkey", btcPubKey: btcWallet.publicKey });
    } else {
      setWalletWarning(
        "Wallet did not provide a public key. Enter a compressed public key manually.",
      );
    }
  }, [connected, walletStxAddress, btcWallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = useCallback(async () => {
    setError("");
    setResult(null);
    setTxId(null);

    const validationError = validateDepositInputs(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const generated = await generateDeposit(form);
      setResult(generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [form]);

  const handleRegister = useCallback(async () => {
    if (!result) return;

    setRegisterError("");
    if (!REGISTRY_CONTRACT) {
      setRegisterError("Registry contract address is not configured.");
      return;
    }

    try {
      const resp = await request("stx_callContract", {
        contract: REGISTRY_CONTRACT as `${string}.${string}`,
        functionName: "register-address",
        functionArgs: [
          Cl.buffer(result.depositScript),
          Cl.buffer(result.reclaimScript),
        ],
        network: STACKS_NETWORK,
      });
      setTxId(resp.txid ?? null);
    } catch (e) {
      console.warn("register-address call failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      setRegisterError(`Register failed: ${msg}`);
    }
  }, [result]);

  const handleReset = useCallback(() => {
    setResult(null);
    setTxId(null);
    setError("");
    setRegisterError("");
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-3xl">
        <AppHeader />

        <DepositForm
          form={form}
          onChange={patchForm}
          btcWallet={btcWallet}
          walletWarning={walletWarning}
          loading={loading}
          disabled={!!result}
          error={error}
          onGenerate={handleGenerate}
        />

        {/* Wallet warning (shown outside the dimmed form when result exists) */}
        {result && walletWarning && (
          <div className="badge-warning mt-4">{walletWarning}</div>
        )}

        {result && (
          <ResultCard
            result={result}
            maxFee={form.maxFee}
            txId={txId}
            registerError={registerError}
            onRegister={handleRegister}
            onReset={handleReset}
          />
        )}
      </div>
    </main>
  );
}
