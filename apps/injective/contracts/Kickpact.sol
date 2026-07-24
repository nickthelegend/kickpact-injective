// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * Kickpact — self-custodial World Cup prediction pools on Injective EVM.
 *
 * Friends lock the SAME kUSD stake on a fixture and pick an outcome
 * (home / draw / away). After full time, ANYONE — a keeper, a member, a
 * stranger — submits the final goal counts together with the oracle's
 * signature over them, and the contract settles.
 *
 * There is no on-chain sports feed on Injective, so the Solana build's CPI into
 * TxLINE's Merkle-proof oracle has no analogue. Instead a fixed set of oracle
 * keys attests to FACTS — the raw final goals — via EIP-712 signatures, and the
 * contract DERIVES the outcome from those goals on-chain. So no signer ever
 * chooses who wins; they only report the score, exactly as TxLINE's proof did.
 *
 * Settlement is M-OF-N: `threshold` independent signers must sign the SAME
 * (fixtureId, homeGoals, awayGoals, ts) before a pool can settle, so no single
 * compromised or dishonest key can move funds — the remaining honest signers
 * simply never co-sign a false score. Signatures are bound to the fixture, not
 * the pool, so one attestation set settles every pool on that match, and anyone
 * may relay it. If no valid set ever arrives, the permissionless
 * `refundExpired` escape hatch returns every stake.
 *
 * No custodian, no admin key over funds, and no single trusted oracle.
 *
 * Outcome encoding matches every other Kickpact build: 1 = home, 2 = draw,
 * 3 = away.
 */
contract Kickpact is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// A proof stamped this long after kickoff is final (90' + stoppage + margin).
    uint64 public constant FULL_TIME_MS = 105 * 60 * 1000;
    /// Nobody settled for two days → self-serve refunds open.
    uint64 public constant REFUND_GRACE_MS = 48 * 60 * 60 * 1000;

    /// EIP-712 struct the oracle signs: the raw final goals for a fixture.
    bytes32 private constant RESULT_TYPEHASH =
        keccak256("Result(uint64 fixtureId,uint8 homeGoals,uint8 awayGoals,uint64 ts)");

    IERC20 public immutable kusd;

    /// The oracle keys whose signatures over a fixture's final goals count, and
    /// how many of them must agree before a pool can settle (M-of-N).
    address[] private _oracleSigners;
    mapping(address => bool) public isOracleSigner;
    uint256 public immutable threshold;

    uint256 public nextPoolId = 1;

    struct Pool {
        uint256 id;
        uint64 fixtureId;
        address creator;
        uint256 stake;
        uint64 deadlineMs; // join cutoff
        uint64 kickoffMs; // anchors settlement finality
        uint32[3] pickCounts; // [home, draw, away]
        uint32 memberCount;
        bool settled;
        uint8 result; // 0 until settled, then 1/2/3
        uint32 winners;
    }

    struct Member {
        uint8 pick;
        bool joined;
        bool claimed;
    }

    mapping(uint256 => Pool) private _pools;
    mapping(uint256 => mapping(address => Member)) private _members;

    event PoolCreated(
        uint256 indexed poolId,
        uint64 indexed fixtureId,
        address indexed creator,
        uint256 stake,
        uint64 deadlineMs,
        uint64 kickoffMs,
        uint8 pick
    );
    event PoolJoined(uint256 indexed poolId, address indexed member, uint8 pick);
    event PoolSettled(
        uint256 indexed poolId,
        uint64 indexed fixtureId,
        uint8 result,
        uint32 winners,
        uint8 homeGoals,
        uint8 awayGoals
    );
    event Claimed(uint256 indexed poolId, address indexed member, uint256 amount);
    event Refunded(uint256 indexed poolId, address indexed member, uint256 amount);

    error ZeroStake();
    error BadPick();
    error DeadlinePassed();
    error AlreadySettled();
    error NotSettled();
    error NoSuchPool();
    error AlreadyJoined();
    error NotAMember();
    error AlreadyClaimed();
    error NotAWinner();
    error NotFinal();
    error BadSignature();
    error GraceNotOver();
    error BadThreshold();
    error BadSigner();
    error NotEnoughSignatures();
    error UnsortedOrDuplicateSigner();

    constructor(IERC20 _kusd, address[] memory signers, uint256 _threshold) EIP712("Kickpact", "1") {
        if (_threshold == 0 || _threshold > signers.length) revert BadThreshold();
        for (uint256 i = 0; i < signers.length; ++i) {
            address s = signers[i];
            if (s == address(0) || isOracleSigner[s]) revert BadSigner();
            isOracleSigner[s] = true;
            _oracleSigners.push(s);
        }
        kusd = _kusd;
        threshold = _threshold;
    }

    /// The full oracle signer set (read-only; fixed at deploy).
    function oracleSigners() external view returns (address[] memory) {
        return _oracleSigners;
    }

    /// How many keys are in the set — pair with `threshold` for "M of N".
    function signerCount() external view returns (uint256) {
        return _oracleSigners.length;
    }

    // ── pools ────────────────────────────────────────────────────────────────

    /**
     * Open a pool on a fixture. `deadlineMs` is the join cutoff, `kickoffMs` the
     * fixture's real start (epoch ms) — settlement finality anchors to kickoff,
     * joining to the deadline. Normal pools set both to kickoff. The creator's
     * stake is pulled in, so the caller must `approve` kUSD first.
     */
    function createPool(
        uint64 fixtureId,
        uint256 stake,
        uint64 deadlineMs,
        uint64 kickoffMs,
        uint8 pick
    ) external nonReentrant returns (uint256 poolId) {
        if (stake == 0) revert ZeroStake();
        if (pick < 1 || pick > 3) revert BadPick();
        if (kickoffMs == 0 || deadlineMs <= _nowMs()) revert DeadlinePassed();

        poolId = nextPoolId++;
        Pool storage p = _pools[poolId];
        p.id = poolId;
        p.fixtureId = fixtureId;
        p.creator = msg.sender;
        p.stake = stake;
        p.deadlineMs = deadlineMs;
        p.kickoffMs = kickoffMs;
        p.pickCounts[pick - 1] = 1;
        p.memberCount = 1;

        _members[poolId][msg.sender] = Member({pick: pick, joined: true, claimed: false});

        emit PoolCreated(poolId, fixtureId, msg.sender, stake, deadlineMs, kickoffMs, pick);
        kusd.safeTransferFrom(msg.sender, address(this), stake);
    }

    /// Join an open pool before its deadline with your own pick.
    function joinPool(uint256 poolId, uint8 pick) external nonReentrant {
        if (pick < 1 || pick > 3) revert BadPick();
        Pool storage p = _pools[poolId];
        if (p.id == 0) revert NoSuchPool();
        if (p.settled) revert AlreadySettled();
        if (_nowMs() >= p.deadlineMs) revert DeadlinePassed();
        if (_members[poolId][msg.sender].joined) revert AlreadyJoined();

        p.pickCounts[pick - 1] += 1;
        p.memberCount += 1;
        _members[poolId][msg.sender] = Member({pick: pick, joined: true, claimed: false});

        emit PoolJoined(poolId, msg.sender, pick);
        kusd.safeTransferFrom(msg.sender, address(this), p.stake);
    }

    /**
     * Permissionless settlement. The caller supplies the fixture's final goals
     * plus `threshold`-or-more oracle signatures over them (sorted by recovered
     * signer address, ascending). The contract verifies every signature belongs
     * to a distinct key in the oracle set, confirms the result is final, DERIVES
     * the outcome from the goals, and settles.
     *
     * A lying caller can't forge signatures, and no signer picks a winner — they
     * only report the score, and a minority can't settle alone. One valid
     * signature set settles every pool on the fixture.
     */
    function settle(
        uint256 poolId,
        uint8 homeGoals,
        uint8 awayGoals,
        uint64 ts,
        bytes[] calldata signatures
    ) external {
        Pool storage p = _pools[poolId];
        if (p.id == 0) revert NoSuchPool();
        if (p.settled) revert AlreadySettled();

        // Final: the attested end time must be comfortably past full time.
        if (ts < p.kickoffMs + FULL_TIME_MS) revert NotFinal();

        // M-of-N: `threshold` distinct oracle keys must have signed exactly these
        // goals for THIS fixture. Recovered addresses must strictly increase,
        // which makes a duplicate signature impossible without an O(n²) scan.
        if (signatures.length < threshold) revert NotEnoughSignatures();
        bytes32 digest = hashResult(p.fixtureId, homeGoals, awayGoals, ts);
        address last = address(0);
        for (uint256 i = 0; i < signatures.length; ++i) {
            address signer = ECDSA.recover(digest, signatures[i]);
            if (signer <= last) revert UnsortedOrDuplicateSigner();
            if (!isOracleSigner[signer]) revert BadSignature();
            last = signer;
        }

        // Build the outcome ON-CHAIN from the raw goals — the signer never picks.
        uint8 outcome = homeGoals > awayGoals ? 1 : (homeGoals == awayGoals ? 2 : 3);

        p.settled = true;
        p.result = outcome;
        p.winners = p.pickCounts[outcome - 1];
        emit PoolSettled(poolId, p.fixtureId, outcome, p.winners, homeGoals, awayGoals);
    }

    /**
     * Winners split the pot equally; if the settled outcome had no backers,
     * every member takes their stake back. Self-serve — the contract owes.
     */
    function claim(uint256 poolId) external nonReentrant {
        Pool storage p = _pools[poolId];
        if (!p.settled) revert NotSettled();
        Member storage m = _members[poolId][msg.sender];
        if (!m.joined) revert NotAMember();
        if (m.claimed) revert AlreadyClaimed();

        uint256 amount;
        if (p.winners == 0) {
            amount = p.stake; // outcome nobody picked → refund
        } else {
            if (m.pick != p.result) revert NotAWinner();
            amount = (p.stake * p.memberCount) / p.winners;
        }
        m.claimed = true;

        emit Claimed(poolId, msg.sender, amount);
        kusd.safeTransfer(msg.sender, amount);
    }

    /**
     * If no valid signature settled the pool within the grace window, members
     * reclaim their stakes without anyone's permission.
     */
    function refundExpired(uint256 poolId) external nonReentrant {
        Pool storage p = _pools[poolId];
        if (p.id == 0) revert NoSuchPool();
        if (p.settled) revert AlreadySettled();
        Member storage m = _members[poolId][msg.sender];
        if (!m.joined) revert NotAMember();
        if (m.claimed) revert AlreadyClaimed();
        if (_nowMs() <= p.kickoffMs + REFUND_GRACE_MS) revert GraceNotOver();

        m.claimed = true;
        emit Refunded(poolId, msg.sender, p.stake);
        kusd.safeTransfer(msg.sender, p.stake);
    }

    // ── views ──────────────────────────────────────────────────────────────

    /// The EIP-712 digest the oracle signs / the client re-derives to verify.
    function hashResult(
        uint64 fixtureId,
        uint8 homeGoals,
        uint8 awayGoals,
        uint64 ts
    ) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(RESULT_TYPEHASH, fixtureId, homeGoals, awayGoals, ts)));
    }

    function getPool(uint256 poolId) external view returns (Pool memory) {
        return _pools[poolId];
    }

    function getMember(uint256 poolId, address who) external view returns (Member memory) {
        return _members[poolId][who];
    }

    /// pot = stake × members; convenience for the UI.
    function pot(uint256 poolId) external view returns (uint256) {
        Pool storage p = _pools[poolId];
        return p.stake * p.memberCount;
    }

    function _nowMs() internal view returns (uint64) {
        return uint64(block.timestamp) * 1000;
    }
}
