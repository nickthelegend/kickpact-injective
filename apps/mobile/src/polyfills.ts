/**
 * Runtime polyfills for @solana/web3.js + anchor on Hermes.
 * MUST be the first import of the app entry.
 */
import "react-native-get-random-values"
import { Buffer } from "buffer"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
if (!g.Buffer) g.Buffer = Buffer
if (!g.process) g.process = { env: {} }
if (!g.process.env) g.process.env = {}
