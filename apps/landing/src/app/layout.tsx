import type { Metadata } from "next"
import "./globals.css"
import Nav from "@/components/nav"

export const metadata: Metadata = {
  title: "Kickpact — Bluetooth World Cup pots that settle themselves",
  description:
    "Pot up with friends on a World Cup match. The pot lives in a Solana escrow that can only pay out what TxLINE's cryptographic proof says happened. Bluetooth duels for friends nearby, a duel code for friends anywhere.",
  icons: {
    icon: "/kickpact-mark.svg",
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-[#10162e] overflow-hidden">
          {/* Kickpact ground: navy + hairline grid + soft blue glows */}
          <div className="fixed inset-0 -z-10">
            <div className="absolute inset-0 bg-[#10162e]" />
            <div className="absolute inset-0 kp-grid opacity-70" />
            <div className="absolute inset-0 opacity-40">
              <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-[#627eea]/20 rounded-full blur-[140px] animate-blob" />
              <div className="absolute top-1/3 -right-1/4 w-1/2 h-1/2 bg-[#627eea]/12 rounded-full blur-[140px] animate-blob animation-delay-2000" />
              <div className="absolute -bottom-1/4 left-1/3 w-1/2 h-1/2 bg-[#e8b84b]/8 rounded-full blur-[140px] animate-blob animation-delay-4000" />
            </div>
          </div>
          <Nav />
          {children}
        </div>
      </body>
    </html>
  )
}
