/**
 * Deliberately minimal. The renderer is the exported Expo web build — it talks
 * to devnet and TxLINE over plain fetch and keeps the burner key in
 * localStorage, so it needs nothing from Node. Keeping this empty means
 * contextIsolation stays meaningful: no Node surface is exposed to the page.
 */
