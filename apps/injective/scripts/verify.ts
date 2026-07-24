/** Verify the deployed KUSD + Kickpact on Injective testnet Blockscout. */
import { run } from "hardhat"
import * as fs from "fs"
import * as path from "path"

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8"))
  try {
    await run("verify:verify", { address: d.kusd, constructorArguments: [] })
  } catch (e: any) {
    console.log("KUSD verify:", e.message)
  }
  try {
    await run("verify:verify", { address: d.kickpact, constructorArguments: [d.kusd, d.oracleSigner] })
  } catch (e: any) {
    console.log("Kickpact verify:", e.message)
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
