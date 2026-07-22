"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/download", label: "Download" },
  { href: "/docs", label: "How it works" },
]

export default function Nav() {
  const pathname = usePathname()
  const active = (p: string) => pathname === p

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#10162e]/80 backdrop-blur-md border-b border-white/10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group">
            {/* the real mark, not an emoji — it renders identically to the
                launcher icon and the favicon, all generated from the same grid */}
            <img src="/kickpact-mark.svg" alt="" width={28} height={28} className="[image-rendering:pixelated]" />
            <span className="font-pixel text-lg tracking-widest text-white group-hover:text-[#627eea] transition-colors">
              KICKPACT
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                <Button
                  variant="ghost"
                  className={`font-pixel text-xs tracking-wider ${
                    active(l.href) ? "text-white" : "text-white/60 hover:text-white"
                  } hover:bg-[#627eea]/15`}
                >
                  {l.label}
                </Button>
              </Link>
            ))}
          </div>

          <Link href="/download">
            <Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl transition-all hover:shadow-[0_0_18px_rgba(98,126,234,0.55)]">
              Download
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}
