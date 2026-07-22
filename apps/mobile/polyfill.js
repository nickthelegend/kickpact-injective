// Runtime polyfills — MUST load before any @solana/web3.js / spl-token code.
import "react-native-get-random-values"
import { Buffer } from "buffer"

// Buffer + process are referenced at module top-level by spl-token/web3.js and
// are absent in both Hermes and the web runtime. `getRandomValues` (above) plus
// tweetnacl's bundled ed25519/sha512 cover everything the burner + MWA paths
// need — no native OpenSSL required.
const g = globalThis
if (!g.Buffer) g.Buffer = Buffer
if (!g.process) g.process = { env: {} }
if (!g.process.env) g.process.env = {}

// Hermes doesn't honour Symbol.species for the `buffer` polyfill, so
// Buffer#subarray/#slice hand back a *plain* Uint8Array with none of the
// Buffer read helpers on it. Anchor's borsh decoder chops the 8-byte
// discriminator with `data.subarray(8)` and then calls `readUInt8` /
// `readUIntLE` on the result → "undefined is not a function", which breaks
// every on-chain account read on device. Re-wrap the prototype.
for (const method of ["subarray", "slice"]) {
  const original = Buffer.prototype[method]
  Buffer.prototype[method] = function patched(...args) {
    const out = original.apply(this, args)
    Object.setPrototypeOf(out, Buffer.prototype)
    return out
  }
}
