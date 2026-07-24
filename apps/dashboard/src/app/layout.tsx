import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "Kickpact · World Cup market viewer",
  description:
    "Live API-Football World Cup odds, on-chain prediction-pool volumes, and cryptographically verifiable settlement receipts on Injective testnet.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              KICK<span>PACT</span>
            </div>
            <Link className="tab on" href="/">
              odds board
            </Link>
            <Link className="tab" href="/receipts">
              receipts
            </Link>
            <div className="right">API-FOOTBALL DATA · SETTLED ON INJECTIVE TESTNET</div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  )
}
