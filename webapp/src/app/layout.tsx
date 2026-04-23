import type { Metadata } from "next";
import localFont from "next/font/local";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-VariableFont_wght.ttf",
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: "100 800",
});

export const metadata: Metadata = {
  title: "sBTC Autobridge",
  description: "Receive your BTC as sBTC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="font-sans bg-grid">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
