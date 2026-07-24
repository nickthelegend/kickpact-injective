import { expect } from "chai"
import { ethers } from "hardhat"
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { HDNodeWallet, Signer } from "ethers"

const ONE_KUSD = 1_000_000n // 6 dp
const FULL_TIME_MS = 105n * 60n * 1000n
const GRACE_MS = 48n * 60n * 60n * 1000n

// EIP-712 signature over a fixture's final goals, exactly as the keeper produces.
async function signResult(
  oracle: HDNodeWallet | Signer,
  verifyingContract: string,
  fixtureId: bigint,
  home: number,
  away: number,
  ts: bigint,
) {
  const domain = { name: "Kickpact", version: "1", chainId: 1439, verifyingContract }
  const types = {
    Result: [
      { name: "fixtureId", type: "uint64" },
      { name: "homeGoals", type: "uint8" },
      { name: "awayGoals", type: "uint8" },
      { name: "ts", type: "uint64" },
    ],
  }
  return oracle.signTypedData(domain, types, { fixtureId, homeGoals: home, awayGoals: away, ts })
}

describe("Kickpact", () => {
  async function deploy() {
    const [deployer, alice, bob, carol] = await ethers.getSigners()
    // A deterministic oracle wallet we control the private key for.
    const oracle = ethers.Wallet.createRandom().connect(ethers.provider)

    const KUSD = await ethers.getContractFactory("KUSD")
    const kusd = await KUSD.deploy()
    await kusd.waitForDeployment()

    const Kickpact = await ethers.getContractFactory("Kickpact")
    const kickpact = await Kickpact.deploy(await kusd.getAddress(), oracle.address)
    await kickpact.waitForDeployment()

    // Fund players with kUSD + approve the escrow.
    for (const u of [alice, bob, carol]) {
      await kusd.connect(u).faucet(1000n * ONE_KUSD)
      await kusd.connect(u).approve(await kickpact.getAddress(), ethers.MaxUint256)
    }

    const nowSec = BigInt(await time.latest())
    const kickoffMs = (nowSec + 3600n) * 1000n // 1h out
    const deadlineMs = kickoffMs
    const finalTs = kickoffMs + FULL_TIME_MS + 60_000n

    return { deployer, alice, bob, carol, oracle, kusd, kickpact, kickoffMs, deadlineMs, finalTs }
  }

  it("faucet mints kUSD and enforces the 1,000 cap", async () => {
    const { kusd, deployer } = await loadFixture(deploy)
    await kusd.faucet(500n * ONE_KUSD)
    expect(await kusd.balanceOf(deployer.address)).to.equal(500n * ONE_KUSD)
    await expect(kusd.faucet(1001n * ONE_KUSD)).to.be.revertedWithCustomError(kusd, "FaucetCap")
    await expect(kusd.faucet(0)).to.be.revertedWithCustomError(kusd, "FaucetCap")
  })

  it("creates a pool, pulling the creator's stake into escrow", async () => {
    const { kickpact, kusd, alice, kickoffMs, deadlineMs } = await loadFixture(deploy)
    const stake = 10n * ONE_KUSD
    await expect(kickpact.connect(alice).createPool(18241006n, stake, deadlineMs, kickoffMs, 1))
      .to.emit(kickpact, "PoolCreated")
      .withArgs(1n, 18241006n, alice.address, stake, deadlineMs, kickoffMs, 1)
    expect(await kusd.balanceOf(await kickpact.getAddress())).to.equal(stake)
    const p = await kickpact.getPool(1)
    expect(p.memberCount).to.equal(1n)
    expect(p.pickCounts[0]).to.equal(1n)
  })

  it("rejects bad picks, zero stake and past deadlines", async () => {
    const { kickpact, alice, kickoffMs, deadlineMs } = await loadFixture(deploy)
    await expect(kickpact.connect(alice).createPool(1n, 0, deadlineMs, kickoffMs, 1)).to.be.revertedWithCustomError(kickpact, "ZeroStake")
    await expect(kickpact.connect(alice).createPool(1n, ONE_KUSD, deadlineMs, kickoffMs, 4)).to.be.revertedWithCustomError(kickpact, "BadPick")
    await expect(kickpact.connect(alice).createPool(1n, ONE_KUSD, 1n, kickoffMs, 1)).to.be.revertedWithCustomError(kickpact, "DeadlinePassed")
  })

  it("lets friends join and blocks double-joins and late joins", async () => {
    const { kickpact, alice, bob, kickoffMs, deadlineMs } = await loadFixture(deploy)
    const stake = 10n * ONE_KUSD
    await kickpact.connect(alice).createPool(1n, stake, deadlineMs, kickoffMs, 1)
    await expect(kickpact.connect(bob).joinPool(1, 3)).to.emit(kickpact, "PoolJoined").withArgs(1n, bob.address, 3)
    await expect(kickpact.connect(bob).joinPool(1, 2)).to.be.revertedWithCustomError(kickpact, "AlreadyJoined")
    const p = await kickpact.getPool(1)
    expect(p.memberCount).to.equal(2n)
    // move past the deadline → joins closed
    await time.increaseTo(kickoffMs / 1000n + 1n)
    await expect(kickpact.connect(alice).joinPool(1, 2)).to.be.revertedWithCustomError(kickpact, "DeadlinePassed")
  })

  it("settles on a valid oracle signature and derives the outcome on-chain", async () => {
    const { kickpact, oracle, alice, bob, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(777n, 10n * ONE_KUSD, deadlineMs, kickoffMs, 1) // alice: home
    await kickpact.connect(bob).joinPool(1, 3) // bob: away

    // 2–1 → home wins → outcome 1. The oracle signs the raw goals only.
    const sig = await signResult(oracle, addr, 777n, 2, 1, finalTs)
    await expect(kickpact.settle(1, 2, 1, finalTs, sig))
      .to.emit(kickpact, "PoolSettled")
      .withArgs(1n, 777n, 1, 1n, 2, 1)
    const p = await kickpact.getPool(1)
    expect(p.settled).to.equal(true)
    expect(p.result).to.equal(1)
    expect(p.winners).to.equal(1n)
  })

  it("derives a draw and an away win from the signed goals", async () => {
    const { kickpact, oracle, alice, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    // draw: 1–1 on fixture A
    await kickpact.connect(alice).createPool(1n, ONE_KUSD, deadlineMs, kickoffMs, 2)
    await kickpact.settle(1, 1, 1, finalTs, await signResult(oracle, addr, 1n, 1, 1, finalTs))
    expect((await kickpact.getPool(1)).result).to.equal(2)
    // away: 0–2 on fixture B
    await kickpact.connect(alice).createPool(2n, ONE_KUSD, deadlineMs, kickoffMs, 3)
    await kickpact.settle(2, 0, 2, finalTs, await signResult(oracle, addr, 2n, 0, 2, finalTs))
    expect((await kickpact.getPool(2)).result).to.equal(3)
  })

  it("rejects a forged signer and a non-final timestamp", async () => {
    const { kickpact, alice, bob, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(9n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    // wrong signer (bob is not the oracle)
    const forged = await signResult(bob, addr, 9n, 2, 0, finalTs)
    await expect(kickpact.settle(9, 2, 0, finalTs, forged)).to.be.revertedWithCustomError(kickpact, "NoSuchPool")
    await expect(kickpact.settle(1, 2, 0, finalTs, forged)).to.be.revertedWithCustomError(kickpact, "BadSignature")
  })

  it("enforces finality before signature checks", async () => {
    const { kickpact, oracle, alice, kickoffMs, deadlineMs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(5n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    const earlyTs = kickoffMs + 60_000n
    const sig = await signResult(oracle, addr, 5n, 2, 0, earlyTs)
    await expect(kickpact.settle(1, 2, 0, earlyTs, sig)).to.be.revertedWithCustomError(kickpact, "NotFinal")
  })

  it("one signature settles every pool on the same fixture", async () => {
    const { kickpact, oracle, alice, bob, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(42n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    await kickpact.connect(bob).createPool(42n, 5n * ONE_KUSD, deadlineMs, kickoffMs, 1)
    const sig = await signResult(oracle, addr, 42n, 3, 0, finalTs)
    await kickpact.settle(1, 3, 0, finalTs, sig)
    await kickpact.settle(2, 3, 0, finalTs, sig) // same sig, second pool
    expect((await kickpact.getPool(1)).settled).to.equal(true)
    expect((await kickpact.getPool(2)).settled).to.equal(true)
  })

  it("pays the winners the whole pot and blocks losers + double claims", async () => {
    const { kickpact, kusd, oracle, alice, bob, carol, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    const stake = 10n * ONE_KUSD
    await kickpact.connect(alice).createPool(11n, stake, deadlineMs, kickoffMs, 1) // home
    await kickpact.connect(bob).joinPool(1, 1) // home
    await kickpact.connect(carol).joinPool(1, 3) // away
    await kickpact.settle(1, 4, 0, finalTs, await signResult(oracle, addr, 11n, 4, 0, finalTs)) // home

    const pot = stake * 3n
    const share = pot / 2n // alice + bob
    const before = await kusd.balanceOf(alice.address)
    await expect(kickpact.connect(alice).claim(1)).to.emit(kickpact, "Claimed").withArgs(1n, alice.address, share)
    expect(await kusd.balanceOf(alice.address)).to.equal(before + share)
    await kickpact.connect(bob).claim(1)
    await expect(kickpact.connect(alice).claim(1)).to.be.revertedWithCustomError(kickpact, "AlreadyClaimed")
    await expect(kickpact.connect(carol).claim(1)).to.be.revertedWithCustomError(kickpact, "NotAWinner")
  })

  it("refunds everyone when the settled outcome had no backers", async () => {
    const { kickpact, kusd, oracle, alice, bob, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    const stake = 7n * ONE_KUSD
    await kickpact.connect(alice).createPool(21n, stake, deadlineMs, kickoffMs, 1) // home
    await kickpact.connect(bob).joinPool(1, 1) // home
    // actual result away → nobody picked away → winners 0 → refunds
    await kickpact.settle(1, 0, 2, finalTs, await signResult(oracle, addr, 21n, 0, 2, finalTs))
    expect((await kickpact.getPool(1)).winners).to.equal(0n)
    const before = await kusd.balanceOf(alice.address)
    await kickpact.connect(alice).claim(1)
    expect(await kusd.balanceOf(alice.address)).to.equal(before + stake)
  })

  it("opens self-serve refunds only after the 48h grace and only if unsettled", async () => {
    const { kickpact, kusd, alice, bob, kickoffMs, deadlineMs } = await loadFixture(deploy)
    const stake = 3n * ONE_KUSD
    await kickpact.connect(alice).createPool(31n, stake, deadlineMs, kickoffMs, 1)
    await kickpact.connect(bob).joinPool(1, 2)
    await expect(kickpact.connect(alice).refundExpired(1)).to.be.revertedWithCustomError(kickpact, "GraceNotOver")
    // jump past kickoff + 48h
    await time.increaseTo(kickoffMs / 1000n + GRACE_MS / 1000n + 10n)
    const before = await kusd.balanceOf(bob.address)
    await kickpact.connect(bob).refundExpired(1)
    expect(await kusd.balanceOf(bob.address)).to.equal(before + stake)
    await expect(kickpact.connect(bob).refundExpired(1)).to.be.revertedWithCustomError(kickpact, "AlreadyClaimed")
  })
})
