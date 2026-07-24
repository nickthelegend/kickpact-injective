/**
 * Open a pool on a fixture (for demos / testing the keeper). Kickoff is set in
 * the past so the pool is immediately past full-time and the keeper will settle
 * it from the bundled snapshot's final score.
 *
 *   FIXTURE=900201 PICK=1 STAKE=5 bunx hardhat run scripts/create-pool.ts --network inj_testnet
 */
import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8"))
  const kusd = await ethers.getContractAt("KUSD", d.kusd)
  const kickpact = await ethers.getContractAt("Kickpact", d.kickpact)
  const gas = {
    gasPrice: BigInt(process.env.INJ_GAS_PRICE || "160000000"),
    gasLimit: BigInt(process.env.INJ_GAS_LIMIT || "2000000"),
  }
  const wait = async (txp: Promise<any>): Promise<string> => {
    const tx = await txp
    for (let i = 0; i < 120; i++) {
      if ((await ethers.provider.getTransactionCount(tx.from, "latest")) > tx.nonce) return tx.hash
      await new Promise((r) => setTimeout(r, 1500))
    }
    throw new Error(`tx not mined: ${tx.hash}`)
  }

  const fixture = BigInt(process.env.FIXTURE || "900201")
  const pick = Number(process.env.PICK || "1")
  const stake = BigInt(Math.round(Number(process.env.STAKE || "5") * 1e6))
  const now = BigInt(Math.floor(Date.now() / 1000))
  const kickoffMs = (now - 200n * 60n) * 1000n
  const deadlineMs = (now + 5n * 60n) * 1000n

  await wait(kusd.faucet(50n * 1_000_000n, gas))
  await wait(kusd.approve(d.kickpact, ethers.MaxUint256, gas))
  const poolId = (await kickpact.nextPoolId()) as bigint
  const hash = await wait(kickpact.createPool(fixture, stake, deadlineMs, kickoffMs, pick, gas))
  console.log(`pool #${poolId} on fixture ${fixture} (pick ${pick}, stake ${Number(stake) / 1e6} kUSD) — ${d.explorer}/tx/${hash}`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
