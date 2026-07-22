//! Kickpact — self-custodial World Cup prediction pools on Solana, settled
//! trustlessly by TxLINE's cryptographically-anchored match data.
//!
//! Friends lock the SAME kUSD stake on a fixture and pick an outcome
//! (home / draw / away). After full time, ANYONE — a keeper bot, a member,
//! a stranger — submits TxLINE's Merkle proof of the final goal counts and
//! the program CPIs into txoracle's `validate_stat_v2` to check it against
//! the roots TxODDS anchors on-chain. The pool can only ever settle to the
//! outcome the oracle proves: the caller picks the *claimed* outcome, but
//! the strategy that must validate is BUILT ON-CHAIN from that claim, so a
//! lying keeper simply fails. Winners split the pot; if nobody called it,
//! everyone refunds. No custodian, no multisig, no admin key over funds.
//!
//! Outcome encoding matches the EVM-era Kickpact: 1 = home, 2 = draw, 3 = away.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("4tAPD5tVaWt9TBSMGKfUnguppbg8KLcc2jXbBPufgWDa");

// The TxLINE oracle (devnet build cloned into localnet tests). declare_program!
// generates the CPI client + Rust types straight from idls/txoracle.json.
declare_program!(txoracle);
use txoracle::program::Txoracle;
use txoracle::types::{
    BinaryExpression, Comparison, NDimensionalStrategy, StatPredicate, StatValidationInput,
    TraderPredicate,
};

/// statKey 1 = participant-1 (home) total goals, 2 = participant-2 (away).
const STAT_HOME_GOALS: u32 = 1;
const STAT_AWAY_GOALS: u32 = 2;
/// TxLINE soccer game phase "Ended".
const PHASE_ENDED: i32 = 5;
/// A proof stamped this long after kickoff is final even if the feed's last
/// record predates the Ended phase flip (90' + stoppage + interval margin).
const FULL_TIME_MS: i64 = 105 * 60 * 1000;
/// Nobody settled for two days → self-serve refunds open.
const REFUND_GRACE_MS: i64 = 48 * 60 * 60 * 1000;
/// Faucet cap per call: 1,000 kUSD.
const FAUCET_CAP: u64 = 1_000_000_000;

#[program]
pub mod kickpact {
    use super::*;

    /// One-time: create the demo kUSD mint (6 dp) + the pool registry.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.mint = ctx.accounts.mint.key();
        cfg.next_pool_id = 1;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Testnet faucet — anyone mints up to 1,000 kUSD per call.
    pub fn faucet(ctx: Context<Faucet>, amount: u64) -> Result<()> {
        require!(amount > 0 && amount <= FAUCET_CAP, KickpactError::FaucetCap);
        let seeds: &[&[u8]] = &[b"mint_auth", &[ctx.bumps.mint_auth]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.mint_auth.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )
    }

    /// Open a pool on a TxLINE fixture. `deadline_ms` is the join cutoff and
    /// `kickoff_ms` the fixture's real StartTime (epoch ms, straight from the
    /// TxLINE fixture record) — settlement finality is anchored to kickoff,
    /// joining to the deadline. Normal pools set both to StartTime.
    pub fn create_pool(
        ctx: Context<CreatePool>,
        fixture_id: i64,
        stake: u64,
        deadline_ms: i64,
        kickoff_ms: i64,
        pick: u8,
    ) -> Result<()> {
        require!(stake > 0, KickpactError::ZeroStake);
        require!((1..=3).contains(&pick), KickpactError::BadPick);
        require!(kickoff_ms > 0, KickpactError::DeadlinePassed);
        let now_ms = Clock::get()?.unix_timestamp * 1000;
        require!(deadline_ms > now_ms, KickpactError::DeadlinePassed);

        let cfg = &mut ctx.accounts.config;
        let pool = &mut ctx.accounts.pool;
        pool.id = cfg.next_pool_id;
        pool.fixture_id = fixture_id;
        pool.creator = ctx.accounts.user.key();
        pool.mint = ctx.accounts.mint.key();
        pool.stake = stake;
        pool.deadline_ms = deadline_ms;
        pool.kickoff_ms = kickoff_ms;
        pool.pick_counts = [0; 3];
        pool.pick_counts[(pick - 1) as usize] = 1;
        pool.member_count = 1;
        pool.settled = false;
        pool.result = 0;
        pool.winners = 0;
        pool.bump = ctx.bumps.pool;
        cfg.next_pool_id += 1;

        let member = &mut ctx.accounts.member;
        member.pool = pool.id;
        member.wallet = ctx.accounts.user.key();
        member.pick = pick;
        member.claimed = false;
        member.bump = ctx.bumps.member;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            stake,
        )
    }

    /// Join an open pool before kickoff with your own pick.
    pub fn join_pool(ctx: Context<JoinPool>, pick: u8) -> Result<()> {
        require!((1..=3).contains(&pick), KickpactError::BadPick);
        let pool = &mut ctx.accounts.pool;
        require!(!pool.settled, KickpactError::AlreadySettled);
        let now_ms = Clock::get()?.unix_timestamp * 1000;
        require!(now_ms < pool.deadline_ms, KickpactError::DeadlinePassed);

        pool.pick_counts[(pick - 1) as usize] += 1;
        pool.member_count += 1;

        let member = &mut ctx.accounts.member;
        member.pool = pool.id;
        member.wallet = ctx.accounts.user.key();
        member.pick = pick;
        member.claimed = false;
        member.bump = ctx.bumps.member;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            pool.stake,
        )
    }

    /// Permissionless settlement. The caller claims an outcome and hands over
    /// TxLINE's Merkle proof of both final goal counts; the program rebuilds
    /// the predicate for that claim and CPIs into the oracle. Only the true
    /// outcome can validate — there is nothing to trust about the caller.
    pub fn settle(ctx: Context<Settle>, outcome: u8, payload: StatValidationInput) -> Result<()> {
        require!((1..=3).contains(&outcome), KickpactError::BadPick);
        let pool = &mut ctx.accounts.pool;
        require!(!pool.settled, KickpactError::AlreadySettled);

        let now_ms = Clock::get()?.unix_timestamp * 1000;
        require!(now_ms >= pool.deadline_ms, KickpactError::MatchNotStarted);
        // (joins are closed once settlement is possible; kickoff anchors finality)

        // the proof must be for THIS fixture…
        require!(
            payload.fixture_summary.fixture_id == pool.fixture_id,
            KickpactError::WrongFixture
        );
        // …carry exactly the two full-game goal stats…
        require!(payload.stats.len() == 2, KickpactError::BadProofShape);
        require!(
            payload.stats[0].stat.key == STAT_HOME_GOALS
                && payload.stats[1].stat.key == STAT_AWAY_GOALS,
            KickpactError::BadProofShape
        );
        // …and be FINAL: either the feed says Ended, or the record is stamped
        // comfortably past full time (kickoff + 90' + stoppage margin).
        let phase = payload.stats[0].stat.period;
        require!(
            phase == PHASE_ENDED || payload.ts >= pool.kickoff_ms + FULL_TIME_MS,
            KickpactError::NotFinal
        );

        // The daily-roots account must be the oracle's PDA for the proof's own
        // epoch day — a spoofed account with a matching layout can't slip in.
        let epoch_day = (payload.ts / 86_400_000) as u16;
        let (expected_roots, _) = Pubkey::find_program_address(
            &[b"daily_scores_roots", &epoch_day.to_le_bytes()],
            &txoracle::ID,
        );
        require_keys_eq!(
            ctx.accounts.daily_scores_merkle_roots.key(),
            expected_roots,
            KickpactError::WrongRootsAccount
        );

        // Build the winning predicate ON-CHAIN from the claimed outcome.
        // index 0 = home goals, index 1 = away goals.
        let predicate = match outcome {
            1 => StatPredicate::Binary {
                index_a: 0,
                index_b: 1,
                op: BinaryExpression::Subtract,
                predicate: TraderPredicate { threshold: 0, comparison: Comparison::GreaterThan },
            },
            2 => StatPredicate::Binary {
                index_a: 0,
                index_b: 1,
                op: BinaryExpression::Subtract,
                predicate: TraderPredicate { threshold: 0, comparison: Comparison::EqualTo },
            },
            _ => StatPredicate::Binary {
                index_a: 1,
                index_b: 0,
                op: BinaryExpression::Subtract,
                predicate: TraderPredicate { threshold: 0, comparison: Comparison::GreaterThan },
            },
        };
        let strategy = NDimensionalStrategy {
            geometric_targets: vec![],
            distance_predicate: None,
            discrete_predicates: vec![predicate],
        };

        let ok = txoracle::cpi::validate_stat_v2(
            CpiContext::new(
                ctx.accounts.txoracle_program.to_account_info(),
                txoracle::cpi::accounts::ValidateStatV2 {
                    daily_scores_merkle_roots: ctx.accounts.daily_scores_merkle_roots.to_account_info(),
                },
            ),
            payload,
            strategy,
        )?
        .get();
        require!(ok, KickpactError::OracleRefuted);

        pool.settled = true;
        pool.result = outcome;
        pool.winners = pool.pick_counts[(outcome - 1) as usize];
        emit!(PoolSettled {
            pool: pool.id,
            fixture_id: pool.fixture_id,
            result: outcome,
            winners: pool.winners,
        });
        Ok(())
    }

    /// Winners split the pot equally; when nobody called it, every member
    /// takes their stake back. Self-serve — the program owes, nobody pays.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let member = &mut ctx.accounts.member;
        require!(pool.settled, KickpactError::NotSettled);
        require!(!member.claimed, KickpactError::AlreadyClaimed);

        let amount = if pool.winners == 0 {
            pool.stake // no winner → refund
        } else {
            require!(member.pick == pool.result, KickpactError::NotAWinner);
            let pot = pool.stake as u128 * pool.member_count as u128;
            (pot / pool.winners as u128) as u64
        };
        member.claimed = true;

        let pool_id = pool.id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"pool", &pool_id, &[pool.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )
    }

    /// If no valid proof settled the pool within the grace window, members
    /// reclaim their stakes without anyone's permission.
    pub fn refund_expired(ctx: Context<Claim>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let member = &mut ctx.accounts.member;
        require!(!pool.settled, KickpactError::AlreadySettled);
        require!(!member.claimed, KickpactError::AlreadyClaimed);
        let now_ms = Clock::get()?.unix_timestamp * 1000;
        require!(now_ms > pool.kickoff_ms + REFUND_GRACE_MS, KickpactError::GraceNotOver);

        member.claimed = true;
        let pool_id = pool.id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"pool", &pool_id, &[pool.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            pool.stake,
        )
    }
}

// ── accounts ────────────────────────────────────────────────────────────────

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub next_pool_id: u64,
    pub bump: u8,
}

#[account]
pub struct Pool {
    pub id: u64,
    pub fixture_id: i64,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub stake: u64,
    pub deadline_ms: i64,
    pub kickoff_ms: i64,
    pub pick_counts: [u16; 3],
    pub member_count: u16,
    pub settled: bool,
    pub result: u8,
    pub winners: u16,
    pub bump: u8,
}

#[account]
pub struct Member {
    pub pool: u64,
    pub wallet: Pubkey,
    pub pick: u8,
    pub claimed: bool,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 8 + 1,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        seeds = [b"mint"],
        bump,
        mint::decimals = 6,
        mint::authority = mint_auth,
    )]
    pub mint: Account<'info, Mint>,
    /// CHECK: PDA that only signs mint_to CPIs.
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_auth: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Faucet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub mint: Account<'info, Mint>,
    /// CHECK: PDA mint authority.
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_auth: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = user,
        space = 8 + 8 + 8 + 32 + 32 + 8 + 8 + 8 + 6 + 2 + 1 + 1 + 2 + 1,
        seeds = [b"pool", config.next_pool_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = user,
        space = 8 + 8 + 32 + 1 + 1 + 1,
        seeds = [b"member", config.next_pool_id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = user)]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinPool<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"pool", pool.id.to_le_bytes().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = user,
        space = 8 + 8 + 32 + 1 + 1 + 1,
        seeds = [b"member", pool.id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    #[account(mut, token::mint = pool.mint, token::authority = pool)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.mint, token::authority = user)]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [b"pool", pool.id.to_le_bytes().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    /// CHECK: verified in the handler against the oracle's PDA derivation
    /// for the proof's own epoch day.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, Txoracle>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"pool", pool.id.to_le_bytes().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"member", pool.id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == user.key() @ KickpactError::NotAMember,
    )]
    pub member: Account<'info, Member>,
    #[account(mut, token::mint = pool.mint, token::authority = pool)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.mint, token::authority = user)]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct PoolSettled {
    pub pool: u64,
    pub fixture_id: i64,
    pub result: u8,
    pub winners: u16,
}

#[error_code]
pub enum KickpactError {
    #[msg("stake must be positive")]
    ZeroStake,
    #[msg("pick must be 1 (home), 2 (draw) or 3 (away)")]
    BadPick,
    #[msg("kickoff already passed")]
    DeadlinePassed,
    #[msg("match has not kicked off yet")]
    MatchNotStarted,
    #[msg("pool already settled")]
    AlreadySettled,
    #[msg("pool not settled yet")]
    NotSettled,
    #[msg("proof is for a different fixture")]
    WrongFixture,
    #[msg("proof must carry exactly the two full-game goal stats")]
    BadProofShape,
    #[msg("score is not final yet")]
    NotFinal,
    #[msg("daily roots account is not the oracle PDA for the proof's epoch day")]
    WrongRootsAccount,
    #[msg("the oracle refuted this outcome")]
    OracleRefuted,
    #[msg("faucet cap is 1,000 kUSD per call")]
    FaucetCap,
    #[msg("not a member of this pool")]
    NotAMember,
    #[msg("already claimed")]
    AlreadyClaimed,
    #[msg("not a winning pick")]
    NotAWinner,
    #[msg("refund grace period not over")]
    GraceNotOver,
}
