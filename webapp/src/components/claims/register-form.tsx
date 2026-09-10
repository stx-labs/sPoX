"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { request } from "@stacks/connect";
import { Cl, Pc, type ClarityValue, type PostCondition } from "@stacks/transactions";
import { useClaimsConfig } from "@/components/claims/claims-config-provider";
import { useWallet } from "@/components/wallet-provider";
import {
  fetchFeePerClaim,
  fetchPosition,
  fetchRegistration,
  fetchSignerManagerTraitCheck,
  type SignerManagerTraitCheck,
  type StakerRegistration,
} from "@/lib/claims-api";
import {
  MAX_CLAIM_INSTALLMENTS,
  bootAddressForNetwork,
  feeMicroForClaimCount,
  formatStxFromMicro,
  isValidContractPrincipal,
  parseClaimCount,
  parseStxToMicro,
  principalMatchesNetwork,
  stacksExplorerTxUrlForConfig,
  type ClaimsConfig,
} from "@/lib/claims-config";

function FieldLabel({
  children,
  help,
}: {
  children: ReactNode;
  help: string;
}) {
  return (
    <span className="claims-field-label">
      <span>{children}</span>
      <span
        className="claims-tooltip"
        tabIndex={0}
        aria-label={help}
        data-tip={help}
      >
        ?
      </span>
    </span>
  );
}

function HelpTooltip({ help }: { help: string }) {
  return (
    <span
      className="claims-tooltip"
      tabIndex={0}
      aria-label={help}
      data-tip={help}
    >
      ?
    </span>
  );
}

function SummaryItem({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt>
        <FieldLabel help={help}>{label}</FieldLabel>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function registrationPostConditions(
  sender: string,
  numClaims: bigint,
  feePerClaim: bigint | null,
): PostCondition[] {
  const escrow = feeMicroForClaimCount(numClaims, feePerClaim ?? 0n);
  if (escrow <= 0n) return [];
  return [Pc.principal(sender).willSendLte(escrow).ustx()];
}

function traitCheckMessage(check: SignerManagerTraitCheck): string {
  if (check === "not-found") {
    return "No contract found at this address on the selected network.";
  }
  return "This contract does not implement the reward-claim-signer-manager-trait. Registration will fail.";
}

function traitCheckBlocksRegistration(
  check: SignerManagerTraitCheck | null,
): check is "not-found" | "not-implemented" {
  return check === "not-found" || check === "not-implemented";
}

function traitCheckScopeKey(
  config: Pick<ClaimsConfig, "network" | "claimsContract">,
  signerManager: string,
): string {
  return `${config.network}|${config.claimsContract}|${signerManager.trim()}`;
}

export function RegisterForm() {
  const { connected, stxAddress, connect } = useWallet();
  const { config } = useClaimsConfig();

  const [staker, setStaker] = useState("");
  const [signerManager, setSignerManager] = useState("");
  const [startCycle, setStartCycle] = useState("");
  const [oneClaimPerCycle, setOneClaimPerCycle] = useState<boolean | null>(
    null,
  );
  const [feeStx, setFeeStx] = useState("");
  const [claimCount, setClaimCount] = useState("");
  const claimCountRef = useRef(claimCount);
  claimCountRef.current = claimCount;
  const [feePerClaim, setFeePerClaim] = useState<bigint | null>(null);
  const [loadingFeeRate, setLoadingFeeRate] = useState(false);
  const [feeRateError, setFeeRateError] = useState("");
  const [positionNote, setPositionNote] = useState("");
  const [positionFound, setPositionFound] = useState(false);
  const [traitCheck, setTraitCheck] = useState<SignerManagerTraitCheck | null>(
    null,
  );
  const [traitCheckScope, setTraitCheckScope] = useState<string | null>(null);
  const [traitNote, setTraitNote] = useState("");
  const [checkingTrait, setCheckingTrait] = useState(false);
  const [registration, setRegistration] = useState<StakerRegistration | null>(
    null,
  );
  const [registrationNote, setRegistrationNote] = useState("");
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [loadingRegistration, setLoadingRegistration] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState("");
  const [txId, setTxId] = useState<string | null>(null);

  const registered = registration !== null;
  const connectedIsStaker =
    Boolean(stxAddress) &&
    stxAddress?.toUpperCase() === staker.trim().toUpperCase();
  const stakerMatchesNetwork = principalMatchesNetwork(
    staker,
    config.network,
  );
  const stakerNetworkMismatch = stakerMatchesNetwork === false;

  // Prefill staker from wallet.
  useEffect(() => {
    if (stxAddress) setStaker((prev) => prev || stxAddress);
  }, [stxAddress]);

  const feeLoadRef = useRef<Promise<bigint | null> | null>(null);
  const feePerClaimRef = useRef<bigint | null>(null);
  const feeScopeRef = useRef<string | null>(null);

  const loadFeePerClaim = useCallback(
    async (force = false): Promise<bigint | null> => {
      if (!config.claimsContract) {
        feePerClaimRef.current = null;
        feeScopeRef.current = null;
        setFeePerClaim(null);
        setFeeRateError("");
        return null;
      }

      const scope = `${config.network}|${config.apiUrl}|${config.claimsContract}`;
      if (
        !force &&
        feePerClaimRef.current !== null &&
        feeScopeRef.current === scope
      ) {
        return feePerClaimRef.current;
      }
      if (!force && feeLoadRef.current) {
        return feeLoadRef.current;
      }

      setLoadingFeeRate(true);
      setFeeRateError("");

      const promise = (async () => {
        try {
          const fee = await fetchFeePerClaim(
            config,
            bootAddressForNetwork(config.network),
          );
          feePerClaimRef.current = fee;
          feeScopeRef.current = scope;
          setFeePerClaim(fee);
          return fee;
        } catch (e) {
          feePerClaimRef.current = null;
          feeScopeRef.current = null;
          setFeePerClaim(null);
          setFeeRateError(e instanceof Error ? e.message : String(e));
          return null;
        } finally {
          setLoadingFeeRate(false);
          feeLoadRef.current = null;
        }
      })();

      feeLoadRef.current = promise;
      return promise;
    },
    [config],
  );

  useEffect(() => {
    feePerClaimRef.current = null;
    feeScopeRef.current = null;
    setFeePerClaim(null);
    void loadFeePerClaim();
  }, [loadFeePerClaim]);

  const clearRegistration = useCallback(() => {
    setRegistration(null);
    setRegistrationNote("");
    setConfirmingCancel(false);
  }, []);

  const clearForStakerChange = useCallback(() => {
    setSignerManager("");
    setStartCycle("");
    setOneClaimPerCycle(null);
    setFeeStx("");
    setClaimCount("");
    setPositionNote("");
    setPositionFound(false);
    setTraitCheck(null);
    setTraitCheckScope(null);
    setTraitNote("");
    setCheckingTrait(false);
    setError("");
    setTxId(null);
    clearRegistration();
  }, [clearRegistration]);

  useEffect(() => {
    clearForStakerChange();
  }, [config.network, config.apiUrl, config.claimsContract, clearForStakerChange]);

  const traitCheckScopeForSigner = traitCheckScopeKey(config, signerManager);
  const traitCheckIsCurrent = traitCheckScope === traitCheckScopeForSigner;
  const signerManagerVerified =
    !checkingTrait &&
    traitCheckIsCurrent &&
    traitCheck === "supported" &&
    Boolean(signerManager.trim());

  const checkSignerManagerTrait = useCallback(
    async (
      signerManagerId: string,
    ): Promise<SignerManagerTraitCheck | null> => {
      const trimmed = signerManagerId.trim();
      if (!trimmed || !isValidContractPrincipal(trimmed)) {
        setTraitCheck(null);
        setTraitCheckScope(null);
        setTraitNote("");
        return null;
      }
      if (!config.claimsContract) {
        setTraitCheck(null);
        setTraitCheckScope(null);
        setTraitNote("");
        return null;
      }

      setCheckingTrait(true);
      setTraitNote("");
      try {
        const result = await fetchSignerManagerTraitCheck(config, trimmed);
        setTraitCheck(result);
        setTraitCheckScope(traitCheckScopeKey(config, trimmed));
        setTraitNote(
          result && traitCheckBlocksRegistration(result)
            ? traitCheckMessage(result)
            : "",
        );
        return result;
      } catch (e) {
        setTraitCheck(null);
        setTraitCheckScope(null);
        setTraitNote("");
        throw e;
      } finally {
        setCheckingTrait(false);
      }
    },
    [config],
  );

  const loadDefaults = useCallback(async () => {
    if (!staker.trim()) {
      setError("Enter a staker address first.");
      return;
    }

    setLoadingDefaults(true);
    setError("");
    setPositionNote("");
    setPositionFound(false);
    clearRegistration();
    try {
      const [position, fee] = await Promise.all([
        fetchPosition(config, staker.trim()),
        loadFeePerClaim(),
      ]);
      const feeNote =
        fee === null
          ? " The registry fee is unavailable until the claims contract is deployed; enter the fee when it is known."
          : "";

      if (!position) {
        setSignerManager("");
        setStartCycle("");
        setPositionFound(false);
        setPositionNote(
          `No live pox-5 position found for this staker. Registration will fail until they stake under a signer-manager.${feeNote}`,
        );
        return;
      }

      setSignerManager(position.signer);
      setStartCycle(position.firstRewardCycle.toString());
      setPositionFound(true);
      await checkSignerManagerTrait(position.signer);
      setPositionNote(
        `Stake found. Signer-manager and start cycle filled from pox-5 smart contract.${feeNote}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDefaults(false);
    }
  }, [checkSignerManagerTrait, clearRegistration, config, loadFeePerClaim, staker]);

  const loadRegistration = useCallback(async () => {
    if (!staker.trim()) {
      setError("Enter a staker address first.");
      return;
    }
    if (!signerManager.trim()) {
      setError(
        "Enter a signer-manager first. Load staking details to fill it from pox-5.",
      );
      return;
    }
    if (!config.claimsContract) {
      setError("Claims registry contract is not configured.");
      return;
    }

    setLoadingRegistration(true);
    setError("");
    setConfirmingCancel(false);
    setRegistrationNote("");
    setPositionNote("");
    setPositionFound(false);
    try {
      const row = await fetchRegistration(
        config,
        staker.trim(),
        signerManager.trim(),
      );
      if (!row) {
        setRegistration(null);
        setRegistrationNote(
          "No registration for this staker and signer-manager. You can register if this principal already has a live pox-5 stake under that signer-manager.",
        );
        return;
      }

      setRegistration(row);
      setOneClaimPerCycle(row.oneClaimPerCycle);
      setRegistrationNote(
        "Registration found. Add claims to top up prepaid installments, or cancel to refund remaining STX.",
      );
    } catch (e) {
      setRegistration(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRegistration(false);
    }
  }, [config, signerManager, staker]);

  const syncFeeFromClaimCount = useCallback(
    (countInput: string) => {
      setClaimCount(countInput);
      if (!feePerClaim) return;
      const parsed = Number.parseInt(countInput.trim(), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFeeStx("");
        return;
      }
      const capped = BigInt(Math.min(parsed, Number(MAX_CLAIM_INSTALLMENTS)));
      setFeeStx(
        formatStxFromMicro(feeMicroForClaimCount(capped, feePerClaim)),
      );
    },
    [feePerClaim],
  );

  const handleFeeStxChange = useCallback(
    (value: string) => {
      setFeeStx(value);
      if (feePerClaim === null || feePerClaim === 0n) return;
      const micro = parseStxToMicro(value);
      if (micro === null || micro <= 0n) {
        setClaimCount("");
        return;
      }
      const raw = micro / feePerClaim;
      setClaimCount(raw > 0n ? raw.toString() : "");
    },
    [feePerClaim],
  );

  useEffect(() => {
    const countInput = claimCountRef.current;
    if (!feePerClaim || !countInput.trim()) return;
    const parsed = Number.parseInt(countInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const capped = BigInt(Math.min(parsed, Number(MAX_CLAIM_INSTALLMENTS)));
    setFeeStx(
      formatStxFromMicro(feeMicroForClaimCount(capped, feePerClaim)),
    );
  }, [feePerClaim]);

  const numClaims = useMemo(
    () => parseClaimCount(claimCount, feeStx, feePerClaim),
    [claimCount, feeStx, feePerClaim],
  );

  const escrowMicro = useMemo(() => {
    if (numClaims === null) return null;
    return feeMicroForClaimCount(numClaims, feePerClaim ?? 0n);
  }, [feePerClaim, numClaims]);

  const submitContractCall = useCallback(
    async (args: {
      functionName: string;
      functionArgs: ClarityValue[];
      postConditions: PostCondition[];
      failed: string;
    }) => {
      if (!connected) {
        connect();
        return;
      }
      if (!config.claimsContract) {
        setError("Claims registry contract is not configured.");
        return;
      }

      setSubmitting(true);
      setError("");
      setTxId(null);
      try {
        const resp = await request("stx_callContract", {
          contract: config.claimsContract as `${string}.${string}`,
          functionName: args.functionName,
          functionArgs: args.functionArgs,
          network: config.network,
          postConditions: args.postConditions,
          postConditionMode: "deny",
        });
        setTxId(resp.txid ?? null);
        return true;
      } catch (e) {
        console.warn(`${args.functionName} failed`, e);
        const msg = e instanceof Error ? e.message : String(e);
        setError(`${args.failed}: ${msg}`);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [connected, connect, config.claimsContract, config.network],
  );

  const handleRegister = useCallback(async () => {
    if (!staker.trim() || !signerManager.trim() || !startCycle.trim()) {
      setError("Staker, signer-manager, and start reward cycle are required.");
      return;
    }
    if (oneClaimPerCycle === null) {
      setError("Choose a claim cadence.");
      return;
    }
    if (numClaims === null) {
      setError(
        feePerClaim === null
          ? "Enter the number of prepaid claims."
          : "Enter a valid number of prepaid claims (1–192).",
      );
      return;
    }
    const needsTraitCheck =
      !traitCheckIsCurrent || traitCheck !== "supported";
    if (needsTraitCheck) {
      try {
        const result = await checkSignerManagerTrait(signerManager.trim());
        if (result !== "supported") {
          if (traitCheckBlocksRegistration(result)) {
            setError(traitCheckMessage(result));
          } else if (!isValidContractPrincipal(signerManager.trim())) {
            setError("Enter a valid signer-manager contract principal.");
          } else if (!config.claimsContract) {
            setError("Claims registry contract is not configured.");
          } else {
            setError("Could not verify signer-manager compatibility.");
          }
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    let start: bigint;
    try {
      start = BigInt(startCycle.trim());
    } catch {
      setError("Start reward cycle must be an integer.");
      return;
    }

    await submitContractCall({
      functionName: "register-for-claims",
      functionArgs: [
        Cl.principal(staker.trim()),
        Cl.principal(signerManager.trim()),
        Cl.uint(start),
        Cl.bool(oneClaimPerCycle),
        Cl.uint(numClaims),
      ],
      postConditions: registrationPostConditions(
        stxAddress ?? staker.trim(),
        numClaims,
        feePerClaim,
      ),
      failed: "Registration failed",
    });
  }, [
    numClaims,
    checkSignerManagerTrait,
    config.claimsContract,
    feePerClaim,
    oneClaimPerCycle,
    signerManager,
    traitCheck,
    traitCheckIsCurrent,
    startCycle,
    staker,
    stxAddress,
    submitContractCall,
  ]);

  const handleAddClaims = useCallback(async () => {
    if (!staker.trim() || !signerManager.trim()) {
      setError("Staker and signer-manager are required.");
      return;
    }
    if (numClaims === null) {
      setError(
        feePerClaim === null
          ? "Enter the number of prepaid claims."
          : "Enter a valid number of prepaid claims (1–192).",
      );
      return;
    }

    const ok = await submitContractCall({
      functionName: "add-claims",
      functionArgs: [
        Cl.principal(staker.trim()),
        Cl.principal(signerManager.trim()),
        Cl.uint(numClaims),
      ],
      postConditions: registrationPostConditions(
        stxAddress ?? staker.trim(),
        numClaims,
        feePerClaim,
      ),
      failed: "Add claims failed",
    });
    if (ok) {
      setFeeStx("");
      setClaimCount("");
      await loadRegistration();
    }
  }, [
    feePerClaim,
    loadRegistration,
    numClaims,
    signerManager,
    staker,
    stxAddress,
    submitContractCall,
  ]);

  const handleCancel = useCallback(async () => {
    if (!connectedIsStaker) {
      setError("Only the staker can cancel, using that account's wallet.");
      return;
    }
    if (!staker.trim() || !signerManager.trim() || !registration) {
      setError("Load a registration before canceling.");
      return;
    }

    const refund = registration.prepaidUstx;
    const postConditions =
      refund > 0n
        ? [
            Pc.principal(config.claimsContract)
              .willSendLte(refund)
              .ustx(),
          ]
        : [];

    const ok = await submitContractCall({
      functionName: "cancel-registration",
      functionArgs: [
        Cl.principal(staker.trim()),
        Cl.principal(signerManager.trim()),
      ],
      postConditions,
      failed: "Cancel failed",
    });
    if (ok) {
      setConfirmingCancel(false);
      clearRegistration();
      setRegistrationNote(
        refund > 0n
          ? `Registration canceled. ${formatStxFromMicro(refund)} STX is refunded to the staker.`
          : "Registration canceled. There was no prepaid STX to refund.",
      );
    }
  }, [
    clearRegistration,
    config.claimsContract,
    connectedIsStaker,
    registration,
    signerManager,
    staker,
    submitContractCall,
  ]);

  return (
    <div className="claims-card">
      <div className="space-y-5">
        <label className="claims-field">
          <FieldLabel help="The Stacks account whose active pox-5 staking position will receive automated reward claims. You can enter any account here without connecting its wallet.">
            Staker
          </FieldLabel>
          <input
            className="claims-input font-mono"
            value={staker}
            onChange={(e) => {
              setStaker(e.target.value);
              clearForStakerChange();
            }}
            placeholder="ST… / SP…"
            autoComplete="off"
          />
        </label>

        {stakerNetworkMismatch && (
          <p
            className={
              config.developerMode
                ? "claims-note"
                : "claims-error"
            }
            role="alert"
          >
            {config.developerMode
              ? `This staker address looks like a ${
                  config.network === "mainnet" ? "testnet" : "mainnet"
                } principal, but the app is on ${config.network}.`
              : `Staker address does not match ${config.network}. Change the address, or enable developer mode to switch networks.`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="claims-btn-secondary"
            onClick={() => void loadDefaults()}
            disabled={loadingDefaults || loadingRegistration}
          >
            {loadingDefaults ? "Loading…" : "Load staking details"}
          </button>
          <button
            type="button"
            className="claims-btn-secondary"
            onClick={() => void loadRegistration()}
            disabled={loadingDefaults || loadingRegistration}
          >
            {loadingRegistration ? "Loading…" : "Load registration"}
          </button>
          <span className="claims-hint">
            Reads use the entered addresses; no wallet connection required.
          </span>
        </div>

        {positionNote && (
          <p
            className={
              positionFound ? "claims-note claims-note-ok" : "claims-note"
            }
          >
            {positionNote}
          </p>
        )}

        <label className="claims-field">
          <FieldLabel help="The signer-manager smart contract associated with the staker. When registering, it must match the signer-manager stored in the pox-5 smart contract; loading staking details fills it from the chain.">
            Signer manager
          </FieldLabel>
          {signerManagerVerified ? (
            <input
              className="claims-input font-mono"
              value={signerManager}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
          ) : (
            <input
              className="claims-input font-mono"
              value={signerManager}
              onChange={(e) => {
                setSignerManager(e.target.value);
                setTraitCheck(null);
                setTraitCheckScope(null);
                setTraitNote("");
                clearRegistration();
              }}
              placeholder="ST….signer-manager"
              autoComplete="off"
            />
          )}
        </label>

        {checkingTrait && (
          <p className="claims-field-hint">Checking trait compatibility…</p>
        )}
        {!checkingTrait &&
          traitCheckIsCurrent &&
          traitCheckBlocksRegistration(traitCheck) &&
          traitNote && (
          <p className="claims-error" role="alert">
            {traitNote}
          </p>
        )}

        {registrationNote && (
          <p className="claims-note claims-note-ok">{registrationNote}</p>
        )}

        {registered && registration && (
          <dl className="claims-summary">
            <SummaryItem
              label="Remaining claims"
              help="How many claim attempts are still prepaid."
            >
              {registration.remainingClaims.toString()}
            </SummaryItem>
            <SummaryItem
              label="Remaining escrow"
              help="STX still held by the registry for unconsumed claims. This is the amount refunded to the staker when they cancel their registration."
            >
              {formatStxFromMicro(registration.prepaidUstx)} STX
            </SummaryItem>
            <SummaryItem
              label="Cadence"
              help="How often this registration is claimed in during each reward cycle."
            >
              {registration.oneClaimPerCycle
                ? "Once per reward cycle"
                : "Twice per reward cycle"}
            </SummaryItem>
            <SummaryItem
              label="Next claim"
              help="Estimated Bitcoin burn height for the next claim attempt."
            >
              {registration.nextClaimBurnHeight !== null
                ? `~${registration.nextClaimBurnHeight.toString()}`
                : `distribution ${(registration.nextClaimDistribution + 1n).toString()}`}
            </SummaryItem>
            <SummaryItem
              label="Bond index"
              help="The bond membership for this stake. None means an STX-only stake."
            >
              {registration.bondIndex === null
                ? "None (STX-only)"
                : registration.bondIndex.toString()}
            </SummaryItem>
          </dl>
        )}

        {!registered && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <label className="claims-field">
              <FieldLabel help="The first pox-5 reward cycle covered by this registration. Defaults to the staker's first eligible reward cycle.">
                Start reward cycle
              </FieldLabel>
              <input
                className="claims-input font-mono"
                value={startCycle}
                onChange={(e) => setStartCycle(e.target.value)}
                placeholder="e.g. 120"
                inputMode="numeric"
              />
            </label>

            <div className="claims-field">
              <FieldLabel help="How often this registration is claimed in each reward cycle.">
                Claim cadence
              </FieldLabel>
              <div className="claims-cadence">
                <button
                  type="button"
                  className={`claims-pill ${oneClaimPerCycle === true ? "claims-pill-active" : ""}`}
                  onClick={() => setOneClaimPerCycle(true)}
                >
                  Once per cycle
                </button>
                <button
                  type="button"
                  className={`claims-pill ${oneClaimPerCycle === false ? "claims-pill-active" : ""}`}
                  onClick={() => setOneClaimPerCycle(false)}
                >
                  Twice per cycle
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="claims-field">
          <FieldLabel
            help={
              registered
                ? "Enter how many claim installments to buy. Escrow is calculated from the on-chain fee per claim (get-fee-per-claim)."
                : "Enter how many claim installments to prepay. Escrow is calculated from the on-chain fee per claim (get-fee-per-claim)."
            }
          >
            Prepaid claims
          </FieldLabel>
          {loadingFeeRate && (
            <p className="claims-field-hint">Loading on-chain fee rate…</p>
          )}
          {!loadingFeeRate && feePerClaim !== null && feePerClaim > 0n && (
            <p className="claims-field-hint">
              On-chain rate: {formatStxFromMicro(feePerClaim)} STX per claim.
              Enter a claim count to fill escrow, or type escrow to see how many
              claims it buys.
            </p>
          )}
          {!loadingFeeRate && feePerClaim === 0n && (
            <p className="claims-field-hint">
              On-chain rate: 0 STX per claim. Enter the number of claim
              installments; no STX escrow is required.
            </p>
          )}
          {!loadingFeeRate && !config.claimsContract && (
            <p className="claims-field-hint">
              Set the registry contract to fetch the on-chain fee rate.
            </p>
          )}
          {!loadingFeeRate &&
            config.claimsContract &&
            feePerClaim === null && (
              <p className="claims-field-hint">
                Could not load the on-chain fee rate
                {feeRateError ? `: ${feeRateError}` : "."}
                <button
                  type="button"
                  className="claims-link"
                  onClick={() => void loadFeePerClaim(true)}
                >
                  Retry
                </button>
              </p>
            )}

          <div
            className={`grid gap-4 mt-2 ${feePerClaim !== null && feePerClaim > 0n ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
          >
            <label className="claims-field">
              <span className="claims-field-sublabel">Number of claims</span>
              <input
                className="claims-input font-mono"
                value={claimCount}
                onChange={(e) => syncFeeFromClaimCount(e.target.value)}
                placeholder="12"
                inputMode="numeric"
              />
            </label>
            {feePerClaim !== null && feePerClaim > 0n && (
              <label className="claims-field">
                <span className="claims-field-sublabel">Escrow (STX)</span>
                <input
                  className="claims-input font-mono"
                  value={feeStx}
                  onChange={(e) => handleFeeStxChange(e.target.value)}
                  placeholder={formatStxFromMicro(feePerClaim)}
                  inputMode="decimal"
                />
              </label>
            )}
          </div>
          <span className="claims-field-hint">
            {feePerClaim !== null && feePerClaim > 0n
              ? "Escrows whole installments only"
              : "Each call accepts 1–192 claim installments"}
            {numClaims !== null
              ? ` — ${registered ? "adds" : "buys"} ${numClaims.toString()} claim${numClaims === 1n ? "" : "s"}${escrowMicro !== null && escrowMicro > 0n ? ` (${formatStxFromMicro(escrowMicro)} STX escrow)` : ""}`
              : ""}
            .
          </span>
        </div>

        {error && <div className="claims-error">{error}</div>}
        {txId && (
          <div className="claims-success">
            Transaction submitted.{" "}
            <a
              href={stacksExplorerTxUrlForConfig(txId, config)}
              target="_blank"
              rel="noopener noreferrer"
              className="claims-link"
            >
              View on explorer
            </a>
            <code className="block mt-2 text-xs break-all font-mono opacity-80">
              {txId}
            </code>
          </div>
        )}

        {registered ? (
          confirmingCancel ? (
            <div className="claims-cancel-confirm">
              <p>
                Cancel this registration?{" "}
                {registration.prepaidUstx > 0n
                  ? `${formatStxFromMicro(registration.prepaidUstx)} STX will be refunded to the staker.`
                  : "There is no prepaid STX to refund."}{" "}
                Pending sBTC withdrawals are not affected.
              </p>
              {!connectedIsStaker && (
                <p>
                  Connect the staker wallet to cancel. Admins cannot cancel for
                  them.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="claims-btn-secondary"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={submitting}
                >
                  Go back
                </button>
                <button
                  type="button"
                  className="claims-btn-danger"
                  onClick={() => void handleCancel()}
                  disabled={submitting || !connectedIsStaker}
                >
                  {submitting ? "Confirm in wallet…" : "Confirm cancel"}
                </button>
              </div>
            </div>
          ) : (
            <div className="claims-manage-actions">
              <div className="claims-manage-action claims-manage-action-primary">
                <button
                  type="button"
                  className="claims-btn-primary"
                  onClick={() => void handleAddClaims()}
                  disabled={submitting}
                >
                  {!connected
                    ? "Connect wallet to add claims"
                    : submitting
                      ? "Confirm in wallet…"
                      : "Add claims"}
                </button>
                <HelpTooltip help="Escrows STX from your wallet to buy more prepaid claim attempts. The claim schedule remains the same." />
              </div>
              <div className="claims-manage-action">
                <button
                  type="button"
                  className="claims-btn-danger-ghost"
                  onClick={() => {
                    setError("");
                    setConfirmingCancel(true);
                  }}
                  disabled={submitting}
                >
                  Cancel registration
                </button>
                <HelpTooltip help="Removes the registration and refunds the remaining escrowed STX to the staker." />
              </div>
            </div>
          )
        ) : (
          <button
            type="button"
            className="claims-btn-primary"
            onClick={() => void handleRegister()}
            disabled={
              submitting ||
              checkingTrait ||
              (traitCheckIsCurrent && traitCheckBlocksRegistration(traitCheck))
            }
          >
            {!connected
              ? "Connect wallet to register"
              : submitting
                ? "Confirm in wallet…"
                : "Register for claims"}
          </button>
        )}
      </div>
    </div>
  );
}
