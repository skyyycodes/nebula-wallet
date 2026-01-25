import type { Metadata } from "next";
import "./globals.css";
import { ChatProvider } from "@/components/providers/chat-provider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Nebula - Quantum Stellar Wallet Demo",
  description: "X402 micropayments and AI Agent Builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <ChatProvider>
          {children}
          <Toaster position="top-right" richColors />
        </ChatProvider>
      </body>
    </html>
  );
}
