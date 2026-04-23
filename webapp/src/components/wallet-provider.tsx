"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from "@stacks/connect";

const BTC_WALLET_STORAGE_KEY = "spox_btc_wallet";

export interface BtcWallet {
  address: string;
  publicKey: string;
}

interface WalletState {
  connected: boolean;
  stxAddress: string | null;
  btcWallet: BtcWallet | null;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  connected: false,
  stxAddress: null,
  btcWallet: null,
  connect: () => {},
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

function loadBtcWallet(): BtcWallet | null {
  const raw = localStorage.getItem(BTC_WALLET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BtcWallet>;
    if (typeof parsed.address === "string" && typeof parsed.publicKey === "string") {
      return { address: parsed.address, publicKey: parsed.publicKey };
    }
  } catch {
    // Malformed JSON — fall through and clear below.
  }
  localStorage.removeItem(BTC_WALLET_STORAGE_KEY);
  return null;
}

function saveBtcWallet(wallet: BtcWallet | null) {
  if (wallet) {
    localStorage.setItem(BTC_WALLET_STORAGE_KEY, JSON.stringify(wallet));
  } else {
    localStorage.removeItem(BTC_WALLET_STORAGE_KEY);
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [stxAddress, setStxAddress] = useState<string | null>(null);
  const [btcWallet, setBtcWalletState] = useState<BtcWallet | null>(null);

  // Address and public key live in one object so they can never desync.
  const setBtcWallet = useCallback((wallet: BtcWallet | null) => {
    setBtcWalletState(wallet);
    saveBtcWallet(wallet);
  }, []);

  // Restore session from localStorage on mount (no popup)
  useEffect(() => {
    if (!stacksIsConnected()) return;
    const stored = getLocalStorage();
    const stxAddr = stored?.addresses?.stx?.[0]?.address ?? null;
    if (stxAddr) {
      setStxAddress(stxAddr);
      setConnected(true);
    }
    // @stacks/connect doesn't persist the BTC publicKey, so we store it ourselves.
    setBtcWalletState(loadBtcWallet());
  }, []);

  // Fresh connect — single popup, extracts everything from the response
  const connect = useCallback(async () => {
    try {
      const resp = await stacksConnect();
      const addresses = resp?.addresses ?? [];

      // STX: match by symbol, fall back to address prefix
      const stx = addresses.find((a) => a.symbol === "STX")
        ?? addresses.find((a) => /^S[PTMN]/.test(a.address));

      // BTC: non-taproot only (P2WPKH/P2WSH) — taproot isn't supported
      const btc = addresses.find(
        (a) => /^(bc1q|bcrt1q|[13])/.test(a.address),
      );

      if (stx?.address) {
        setStxAddress(stx.address);
        setConnected(true);
      }
      setBtcWallet(
        btc?.address && btc?.publicKey
          ? { address: btc.address, publicKey: btc.publicKey }
          : null,
      );

      // Some wallets don't return addresses in the response but do persist
      // them in localStorage — fall back if needed
      if (!stx?.address) {
        const stored = getLocalStorage();
        const storedStx = stored?.addresses?.stx?.[0]?.address ?? null;
        if (storedStx) {
          setStxAddress(storedStx);
          setConnected(true);
        }
      }
    } catch (e) {
      // Most commonly the user cancelled the popup. Log in case it's
      // actually a missing extension, chain mismatch, or other real failure.
      console.warn("wallet connect failed", e);
    }
  }, [setBtcWallet]);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setConnected(false);
    setStxAddress(null);
    setBtcWallet(null);
  }, [setBtcWallet]);

  return (
    <WalletContext.Provider
      value={{ connected, stxAddress, btcWallet, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
