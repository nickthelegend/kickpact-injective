/**
 * End-to-end proof on Injective testnet: faucet kUSD → open a pool → settle it
 * with an oracle-signed score → claim. Uses a pool whose kickoff is in the past
 * (so the result is already "final") but whose join deadline is a few minutes
 * out (so createPool passes), to run the whole lifecycle in one shot.
 */
import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

const FIXTURE = 999001n
const HOME = 2
const AWAY = 1

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8"))
  const [signer] = await ethers.getSigners()
  const oraclePk = process.env.ORACLE_SIGNER_PRIVATE_KEY!
  const oracle = new ethers.Wallet(oraclePk)
  if (oracle.address.toLowerCase() !== d.oracleSigner.toLowerCase()) {
    throw new Error(`oracle key ${oracle.address} != deployed signer ${d.oracleSigner}`)
  }

  const kusd = await ethers.getContractAt("KUSD", d.kusd)
  const kickpact = await ethers.getContractAt("Kickpact", d.kickpact)
  const gas = {
    gasPrice: BigInt(process.env.INJ_GAS_PRICE || "160000000"),
    gasLimit: BigInt(process.env.INJ_GAS_LIMIT || "2000000"),
  }

  // Injective's eth_getTransactionReceipt(hash) is unreliable behind its k8s
  // RPC load balancer (returns null for already-mined txs), but STATE reads
  // replicate fine — so confirm a tx by waiting for the sender's nonce to
  // advance, not by fetching the receipt.
  const wait = async (txp: Promise<any>): Promise<string> => {
    const tx = await txp
    for (let i = 0; i < 120; i++) {
      if ((await ethers.provider.getTransactionCount(tx.from, "latest")) > tx.nonce) return tx.hash
      await new Promise((r) => setTimeout(r, 1500))
    }
    throw new Error(`tx not mined: ${tx.hash}`)
  }

  const now = BigInt(Math.floor(Date.now() / 1000))
  const kickoffMs = (now - 200n * 60n) * 1000n // 200m ago → already final
  const deadlineMs = (now + 5n * 60n) * 1000n // 5m out → createPool ok
  const tsMs = now * 1000n

  console.log("faucet 100 kUSD…")
  await wait(kusd.faucet(100n * 1_000_000n, gas))
  await wait(kusd.approve(d.kickpact, ethers.MaxUint256, gas))

  console.log("create pool (pick: home)…")
  const stake = 10n * 1_000_000n
  // poolId comes from state (nextPoolId), not the event log — createPool assigns
  // pool.id = nextPoolId, so read it before the call.
  const poolId = (await kickpact.nextPoolId()) as bigint
  const createHash = await wait(kickpact.createPool(FIXTURE, stake, deadlineMs, kickoffMs, 1, gas))
  console.log(`  pool #${poolId}  tx ${d.explorer}/tx/${createHash}`)

  console.log(`sign ${HOME}-${AWAY} with the oracle key…`)
  const domain = { name: "Kickpact", version: "1", chainId: d.chainId, verifyingContract: d.kickpact }
  const types = {
    Result: [
      { name: "fixtureId", type: "uint64" },
      { name: "homeGoals", type: "uint8" },
      { name: "awayGoals", type: "uint8" },
      { name: "ts", type: "uint64" },
    ],
  }
  const sig = await oracle.signTypedData(domain, types, { fixtureId: FIXTURE, homeGoals: HOME, awayGoals: AWAY, ts: tsMs })

  console.log("settle…")
  const settleHash = await wait(kickpact.settle(poolId, HOME, AWAY, tsMs, sig, gas))
  console.log(`  settled  tx ${d.explorer}/tx/${settleHash}`)
  const p = await kickpact.getPool(poolId)
  console.log(`  result=${p.result} (1=home 2=draw 3=away)  winners=${p.winners}`)

  console.log("claim…")
  const claimHash = await wait(kickpact.claim(poolId, gas))
  console.log(`  claimed  tx ${d.explorer}/tx/${claimHash}`)
  console.log(`\nkUSD balance: ${ethers.formatUnits(await kusd.balanceOf(signer.address), 6)}`)
  console.log("end-to-end settlement proven ✔")
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
