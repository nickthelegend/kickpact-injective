import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "Kickpact · World Cup market viewer",
  description:
    "Live TxLINE World Cup odds, on-chain prediction-pool volumes, and cryptographically verifiable settlement receipts on Solana devnet.",
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
            <div className="right">TXLINE DATA · SETTLED ON SOLANA DEVNET</div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  )
}
