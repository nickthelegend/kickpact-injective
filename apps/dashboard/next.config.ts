import type { NextConfig } from "next"
import { fileURLToPath } from "node:url"

// This app lives in a bun workspace, so Turbopack would otherwise infer the
// monorepo root and fail to resolve `next` from ./src/app. Pin the root to this
// package. `__dirname` doesn't exist in an ESM config, so derive it from
// import.meta — passing an undefined root is what broke the build.
const here = fileURLToPath(new URL(".", import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: { root: here },
}

export default nextConfig
