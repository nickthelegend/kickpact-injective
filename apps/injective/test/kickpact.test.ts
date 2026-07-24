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

/**
 * An M-of-N attestation: sign with each oracle and return the signatures sorted
 * by signer address ascending, which is the order `settle` requires (that
 * ordering is what makes duplicates impossible without an O(n²) scan).
 */
async function attest(
  oracles: HDNodeWallet[],
  verifyingContract: string,
  fixtureId: bigint,
  home: number,
  away: number,
  ts: bigint,
): Promise<string[]> {
  const signed = await Promise.all(
    oracles.map(async (o) => ({
      addr: o.address.toLowerCase(),
      sig: await signResult(o, verifyingContract, fixtureId, home, away, ts),
    })),
  )
  return signed.sort((a, b) => (a.addr < b.addr ? -1 : 1)).map((s) => s.sig)
}

describe("Kickpact", () => {
  async function deploy() {
    const [deployer, alice, bob, carol] = await ethers.getSigners()
    // Three independent oracle wallets; settlement needs 2 of them to agree.
    const oracles = [
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
    ]
    const THRESHOLD = 2n
    const oracle = oracles[0] // a lone signer — never enough on its own
    const rogue = ethers.Wallet.createRandom() // not in the set

    const KUSD = await ethers.getContractFactory("KUSD")
    const kusd = await KUSD.deploy()
    await kusd.waitForDeployment()

    const Kickpact = await ethers.getContractFactory("Kickpact")
    const kickpact = await Kickpact.deploy(
      await kusd.getAddress(),
      oracles.map((o) => o.address),
      THRESHOLD,
    )
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

    return {
      deployer, alice, bob, carol,
      oracle, oracles, rogue, THRESHOLD,
      kusd, kickpact, kickoffMs, deadlineMs, finalTs,
    }
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
    const { kickpact, oracles, alice, bob, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(777n, 10n * ONE_KUSD, deadlineMs, kickoffMs, 1) // alice: home
    await kickpact.connect(bob).joinPool(1, 3) // bob: away

    // 2–1 → home wins → outcome 1. The oracle signs the raw goals only.
    const sig = await attest(oracles.slice(0, 2), addr, 777n, 2, 1, finalTs)
    await expect(kickpact.settle(1, 2, 1, finalTs, sig))
      .to.emit(kickpact, "PoolSettled")
      .withArgs(1n, 777n, 1, 1n, 2, 1)
    const p = await kickpact.getPool(1)
    expect(p.settled).to.equal(true)
    expect(p.result).to.equal(1)
    expect(p.winners).to.equal(1n)
  })

  it("derives a draw and an away win from the signed goals", async () => {
    const { kickpact, oracles, alice, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    // draw: 1–1 on fixture A
    await kickpact.connect(alice).createPool(1n, ONE_KUSD, deadlineMs, kickoffMs, 2)
    await kickpact.settle(1, 1, 1, finalTs, await attest(oracles.slice(0, 2), addr, 1n, 1, 1, finalTs))
    expect((await kickpact.getPool(1)).result).to.equal(2)
    // away: 0–2 on fixture B
    await kickpact.connect(alice).createPool(2n, ONE_KUSD, deadlineMs, kickoffMs, 3)
    await kickpact.settle(2, 0, 2, finalTs, await attest(oracles.slice(0, 2), addr, 2n, 0, 2, finalTs))
    expect((await kickpact.getPool(2)).result).to.equal(3)
  })

  it("rejects a forged signer and a non-final timestamp", async () => {
    const { kickpact, oracles, rogue, alice, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(9n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    // an outsider co-signing with a real oracle is still not a valid set
    const forged = await attest([oracles[0], rogue], addr, 9n, 2, 0, finalTs)
    await expect(kickpact.settle(9, 2, 0, finalTs, forged)).to.be.revertedWithCustomError(kickpact, "NoSuchPool")
    await expect(kickpact.settle(1, 2, 0, finalTs, forged)).to.be.revertedWithCustomError(kickpact, "BadSignature")
  })

  it("needs the threshold: one signer alone can never settle", async () => {
    const { kickpact, oracles, alice, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(31n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    // a single honest oracle — below threshold
    const lone = await attest([oracles[0]], addr, 31n, 2, 0, finalTs)
    await expect(kickpact.settle(1, 2, 0, finalTs, lone)).to.be.revertedWithCustomError(kickpact, "NotEnoughSignatures")
    await expect(kickpact.settle(1, 2, 0, finalTs, [])).to.be.revertedWithCustomError(kickpact, "NotEnoughSignatures")
    // add a second independent key and it settles
    await kickpact.settle(1, 2, 0, finalTs, await attest(oracles.slice(0, 2), addr, 31n, 2, 0, finalTs))
    expect((await kickpact.getPool(1)).result).to.equal(1)
  })

  it("rejects the same signer twice (a duplicate can't reach the threshold)", async () => {
    const { kickpact, oracles, alice, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(32n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    const one = await signResult(oracles[0], addr, 32n, 2, 0, finalTs)
    await expect(kickpact.settle(1, 2, 0, finalTs, [one, one])).to.be.revertedWithCustomError(
      kickpact,
      "UnsortedOrDuplicateSigner",
    )
  })

  it("rejects an unsorted signature set", async () => {
    const { kickpact, oracles, alice, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(33n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    const sorted = await attest(oracles.slice(0, 2), addr, 33n, 2, 0, finalTs)
    await expect(
      kickpact.settle(1, 2, 0, finalTs, [sorted[1], sorted[0]]),
    ).to.be.revertedWithCustomError(kickpact, "UnsortedOrDuplicateSigner")
  })

  it("exposes the signer set and threshold", async () => {
    const { kickpact, oracles, THRESHOLD } = await loadFixture(deploy)
    expect(await kickpact.threshold()).to.equal(THRESHOLD)
    expect(await kickpact.signerCount()).to.equal(BigInt(oracles.length))
    const set = await kickpact.oracleSigners()
    for (const o of oracles) expect(set).to.include(o.address)
    expect(await kickpact.isOracleSigner(oracles[0].address)).to.equal(true)
  })

  it("any 2 of the 3 keys can settle — no single key is load-bearing", async () => {
    const { kickpact, oracles, alice, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    // pool 1 settled by keys {0,2}; pool 2 by {1,2} — signer 0 never participates
    await kickpact.connect(alice).createPool(34n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    await kickpact.settle(1, 2, 0, finalTs, await attest([oracles[0], oracles[2]], addr, 34n, 2, 0, finalTs))
    await kickpact.connect(alice).createPool(35n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    await kickpact.settle(2, 2, 0, finalTs, await attest([oracles[1], oracles[2]], addr, 35n, 2, 0, finalTs))
    expect((await kickpact.getPool(1)).settled).to.equal(true)
    expect((await kickpact.getPool(2)).settled).to.equal(true)
  })

  it("enforces finality before signature checks", async () => {
    const { kickpact, oracles, alice, kickoffMs, deadlineMs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(5n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    const earlyTs = kickoffMs + 60_000n
    const sig = await attest(oracles.slice(0, 2), addr, 5n, 2, 0, earlyTs)
    await expect(kickpact.settle(1, 2, 0, earlyTs, sig)).to.be.revertedWithCustomError(kickpact, "NotFinal")
  })

  it("one signature settles every pool on the same fixture", async () => {
    const { kickpact, oracles, alice, bob, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    await kickpact.connect(alice).createPool(42n, ONE_KUSD, deadlineMs, kickoffMs, 1)
    await kickpact.connect(bob).createPool(42n, 5n * ONE_KUSD, deadlineMs, kickoffMs, 1)
    const sig = await attest(oracles.slice(0, 2), addr, 42n, 3, 0, finalTs)
    await kickpact.settle(1, 3, 0, finalTs, sig)
    await kickpact.settle(2, 3, 0, finalTs, sig) // same sig, second pool
    expect((await kickpact.getPool(1)).settled).to.equal(true)
    expect((await kickpact.getPool(2)).settled).to.equal(true)
  })

  it("pays the winners the whole pot and blocks losers + double claims", async () => {
    const { kickpact, kusd, oracles, alice, bob, carol, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    const stake = 10n * ONE_KUSD
    await kickpact.connect(alice).createPool(11n, stake, deadlineMs, kickoffMs, 1) // home
    await kickpact.connect(bob).joinPool(1, 1) // home
    await kickpact.connect(carol).joinPool(1, 3) // away
    await kickpact.settle(1, 4, 0, finalTs, await attest(oracles.slice(0, 2), addr, 11n, 4, 0, finalTs)) // home

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
    const { kickpact, kusd, oracles, alice, bob, kickoffMs, deadlineMs, finalTs } = await loadFixture(deploy)
    const addr = await kickpact.getAddress()
    const stake = 7n * ONE_KUSD
    await kickpact.connect(alice).createPool(21n, stake, deadlineMs, kickoffMs, 1) // home
    await kickpact.connect(bob).joinPool(1, 1) // home
    // actual result away → nobody picked away → winners 0 → refunds
    await kickpact.settle(1, 0, 2, finalTs, await attest(oracles.slice(0, 2), addr, 21n, 0, 2, finalTs))
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

// ── EIP-3009: the gasless transfer x402 settles with ────────────────────────
describe("KUSD — EIP-3009 transferWithAuthorization", () => {
  const AUTH_TYPES = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  }

  async function setup() {
    const [, , , , facilitator] = await ethers.getSigners()
    const KUSD = await ethers.getContractFactory("KUSD")
    const kusd = await KUSD.deploy()
    await kusd.waitForDeployment()
    const payer = ethers.Wallet.createRandom() // never funded with gas
    await kusd.connect(facilitator).faucet(100n * ONE_KUSD)
    await kusd.connect(facilitator).transfer(payer.address, 50n * ONE_KUSD)
    const addr = await kusd.getAddress()
    const domain = { name: "Kickpact USD", version: "1", chainId: 1439, verifyingContract: addr }
    const now = BigInt(await time.latest())
    return { kusd, payer, facilitator, addr, domain, now }
  }

  const auth = (payer: any, domain: any, to: string, value: bigint, now: bigint, nonce: string) => ({
    value: { from: payer.address, to, value, validAfter: now - 10n, validBefore: now + 3600n, nonce },
    sign: () =>
      payer.signTypedData(domain, AUTH_TYPES, {
        from: payer.address,
        to,
        value,
        validAfter: now - 10n,
        validBefore: now + 3600n,
        nonce,
      }),
  })

  it("moves tokens on a signed authorization — payer needs no gas and no approve", async () => {
    const { kusd, payer, facilitator, domain, now } = await setup()
    const to = facilitator.address
    const nonce = ethers.hexlify(ethers.randomBytes(32))
    const a = auth(payer, domain, to, 10n * ONE_KUSD, now, nonce)
    const sig = await a.sign()

    expect(await ethers.provider.getBalance(payer.address)).to.equal(0n) // payer has no INJ
    const before = await kusd.balanceOf(to)
    await expect(
      kusd
        .connect(facilitator)
        .transferWithAuthorization(a.value.from, to, a.value.value, a.value.validAfter, a.value.validBefore, nonce, sig),
    )
      .to.emit(kusd, "AuthorizationUsed")
      .withArgs(payer.address, nonce)
    expect(await kusd.balanceOf(to)).to.equal(before + 10n * ONE_KUSD)
    expect(await kusd.balanceOf(payer.address)).to.equal(40n * ONE_KUSD)
    expect(await kusd.authorizationState(payer.address, nonce)).to.equal(true)
  })

  it("rejects a replayed nonce, a forged signature and an expired authorization", async () => {
    const { kusd, payer, facilitator, domain, now } = await setup()
    const to = facilitator.address
    const nonce = ethers.hexlify(ethers.randomBytes(32))
    const a = auth(payer, domain, to, ONE_KUSD, now, nonce)
    const sig = await a.sign()
    const send = (s: string, n = nonce, vb = a.value.validBefore) =>
      kusd.connect(facilitator).transferWithAuthorization(payer.address, to, ONE_KUSD, a.value.validAfter, vb, n, s)

    await send(sig)
    await expect(send(sig)).to.be.revertedWithCustomError(kusd, "AuthorizationAlreadyUsed") // replay

    // a signature from someone else over the same terms
    const impostor = ethers.Wallet.createRandom()
    const nonce2 = ethers.hexlify(ethers.randomBytes(32))
    const forged = await impostor.signTypedData(domain, AUTH_TYPES, {
      from: payer.address, to, value: ONE_KUSD, validAfter: a.value.validAfter, validBefore: a.value.validBefore, nonce: nonce2,
    })
    await expect(send(forged, nonce2)).to.be.revertedWithCustomError(kusd, "InvalidSignature")

    // expired
    const nonce3 = ethers.hexlify(ethers.randomBytes(32))
    const past = now - 1n
    const expired = await payer.signTypedData(domain, AUTH_TYPES, {
      from: payer.address, to, value: ONE_KUSD, validAfter: a.value.validAfter, validBefore: past, nonce: nonce3,
    })
    await expect(send(expired, nonce3, past)).to.be.revertedWithCustomError(kusd, "AuthorizationExpired")
  })

  it("lets the payer cancel an unused authorization", async () => {
    const { kusd, payer, facilitator, domain, now } = await setup()
    const nonce = ethers.hexlify(ethers.randomBytes(32))
    const a = auth(payer, domain, facilitator.address, ONE_KUSD, now, nonce)
    const sig = await a.sign()
    const cancelSig = await payer.signTypedData(
      domain,
      { CancelAuthorization: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }] },
      { authorizer: payer.address, nonce },
    )
    await kusd.connect(facilitator).cancelAuthorization(payer.address, nonce, cancelSig)
    await expect(
      kusd.connect(facilitator).transferWithAuthorization(payer.address, facilitator.address, ONE_KUSD, a.value.validAfter, a.value.validBefore, nonce, sig),
    ).to.be.revertedWithCustomError(kusd, "AuthorizationAlreadyUsed")
  })
})
