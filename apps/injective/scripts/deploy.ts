/**
 * Deploy KUSD + Kickpact to Injective EVM testnet (chainId 1439) and record the
 * addresses + ABIs so the mobile app, dashboard and keeper can all read them.
 */
import { ethers, network } from "hardhat"
import * as fs from "fs"
import * as path from "path"

/** The oracle signer set — settlement needs THRESHOLD of these to agree. */
const SIGNERS = [
  process.env.ORACLE_SIGNER_ADDRESS,
  process.env.ORACLE_SIGNER_2_ADDRESS,
  process.env.ORACLE_SIGNER_3_ADDRESS,
].filter((a): a is string => !!a && ethers.isAddress(a))
const THRESHOLD = BigInt(process.env.ORACLE_THRESHOLD || "2")
/** Native USDC on Injective testnet — the second escrow's stake token. */
const USDC = process.env.USDC_ADDRESS

async function main() {
  if (SIGNERS.length < Number(THRESHOLD)) {
    throw new Error(`need ≥${THRESHOLD} oracle signer addresses in .env, found ${SIGNERS.length}`)
  }
  const [deployer] = await ethers.getSigners()
  const bal = await ethers.provider.getBalance(deployer.address)
  console.log(`deployer ${deployer.address} — ${ethers.formatEther(bal)} INJ`)
  if (bal === 0n) throw new Error("deployer has 0 INJ — fund it from the faucet first")

  // Injective testnet wants a legacy gasPrice (~0.16 gwei), and an explicit
  // gasLimit so ethers doesn't hang on a slow eth_estimateGas. Both env-tunable.
  const overrides = {
    gasPrice: BigInt(process.env.INJ_GAS_PRICE || "160000000"),
    gasLimit: BigInt(process.env.INJ_GAS_LIMIT || "6000000"),
  }

  // Injective's receipt RPC (eth_getTransactionReceipt) is sometimes flaky, so
  // don't wait on it — the CREATE address is deterministic; poll eth_getCode
  // (tolerating transient errors) until the bytecode is on-chain.
  async function confirm(c: any, label: string): Promise<string> {
    const addr = await c.getAddress()
    console.log(`  ${label} tx ${c.deploymentTransaction()?.hash} → ${addr} (waiting for code…)`)
    for (let i = 0; i < 150; i++) {
      try {
        if ((await ethers.provider.getCode(addr)) !== "0x") return addr
      } catch {}
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error(`${label} bytecode not on-chain after 5min at ${addr}`)
  }

  const KUSD = await ethers.getContractFactory("KUSD")
  const kusd = await KUSD.deploy(overrides)
  const kusdAddr = await confirm(kusd, "KUSD")
  console.log(`KUSD      ${kusdAddr}`)

  console.log(`oracle set (${THRESHOLD}-of-${SIGNERS.length}): ${SIGNERS.join(", ")}`)

  const Kickpact = await ethers.getContractFactory("Kickpact")
  const kickpact = await Kickpact.deploy(kusdAddr, SIGNERS, THRESHOLD, overrides)
  const kickpactAddr = await confirm(kickpact, "Kickpact")
  console.log(`Kickpact  ${kickpactAddr}   (stake: kUSD)`)

  // A second escrow denominated in NATIVE USDC on Injective — same code, same
  // oracle set; the stake token is a constructor argument, nothing else changes.
  let kickpactUsdcAddr: string | null = null
  if (USDC && ethers.isAddress(USDC)) {
    const code = await ethers.provider.getCode(USDC)
    if (code === "0x") {
      console.log(`!! no contract at USDC_ADDRESS ${USDC} — skipping the USDC escrow`)
    } else {
      const ku = await Kickpact.deploy(USDC, SIGNERS, THRESHOLD, overrides)
      kickpactUsdcAddr = await confirm(ku, "Kickpact(USDC)")
      console.log(`Kickpact  ${kickpactUsdcAddr}   (stake: native USDC)`)
    }
  }

  const out = {
    network: network.name,
    chainId: 1439,
    rpc: process.env.INJ_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/",
    explorer: "https://testnet.blockscout.injective.network",
    kusd: kusdAddr,
    kickpact: kickpactAddr,
    usdc: USDC ?? null,
    kickpactUsdc: kickpactUsdcAddr,
    oracleSigners: SIGNERS,
    threshold: Number(THRESHOLD),
    deployedBy: deployer.address,
  }
  const deploymentsPath = path.join(__dirname, "..", "deployments.json")
  fs.writeFileSync(deploymentsPath, JSON.stringify(out, null, 2) + "\n")
  console.log(`\nwrote ${deploymentsPath}`)

  // Export ABIs and sync addresses + ABIs into the app + dashboard so a single
  // deploy updates the whole monorepo.
  exportAbi("Kickpact")
  exportAbi("KUSD")
  const clientOut = { ...out }
  delete (clientOut as any).deployedBy
  for (const app of ["mobile", "dashboard"]) {
    const dst = path.join(__dirname, "..", "..", app, "src")
    if (!fs.existsSync(dst)) continue
    fs.writeFileSync(path.join(dst, "deployment.json"), JSON.stringify(clientOut, null, 2) + "\n")
    fs.mkdirSync(path.join(dst, "abi"), { recursive: true })
    for (const n of ["Kickpact", "KUSD"]) {
      fs.copyFileSync(path.join(__dirname, "..", "abi", `${n}.json`), path.join(dst, "abi", `${n}.json`))
    }
    console.log(`synced ${app}/src/deployment.json + abi`)
  }

  console.log(`\nexplorer:`)
  console.log(`  ${out.explorer}/address/${kusdAddr}`)
  console.log(`  ${out.explorer}/address/${kickpactAddr}`)
  if (kickpactUsdcAddr) console.log(`  ${out.explorer}/address/${kickpactUsdcAddr}  (USDC)`)
  console.log(`\nverify:  bun run verify`)
}

function exportAbi(name: string) {
  const artifact = require(path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`))
  const dir = path.join(__dirname, "..", "abi")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(artifact.abi, null, 2) + "\n")
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
