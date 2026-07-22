// Entry point — the crypto polyfill MUST load before any @solana/web3.js code.
import "./polyfill"

import { registerRootComponent } from "expo"
import App from "./App"

registerRootComponent(App)
