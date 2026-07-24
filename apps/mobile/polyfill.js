// Runtime polyfills — MUST load before ethers or any wallet code.
// ethers v6 needs a CSPRNG (crypto.getRandomValues) for key generation and
// signing; react-native-get-random-values installs it on Hermes and the web
// runtime. Buffer/process are referenced at module top-level by some deps and
// are absent in Hermes, so provide them too.
import "react-native-get-random-values"
import { Buffer } from "buffer"

const g = globalThis
if (!g.Buffer) g.Buffer = Buffer
if (!g.process) g.process = { env: {} }
if (!g.process.env) g.process.env = {}
