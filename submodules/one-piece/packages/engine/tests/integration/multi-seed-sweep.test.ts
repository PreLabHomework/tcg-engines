import { describe, expect, test } from "vite-plus/test";
import type { EngineCommand } from "../../src/types.ts";

import { replayMatch } from "../../src/core.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import type { MatchSeat } from "../../src/types.ts";
import { MAX_COMMANDS, matchConfig, type DeckId } from "./deck-fixtures.ts";
import "@tcg/op-cards";

/**
 * Phase 0C: multi-seed sweep across all nine ordered deck/seat pairings.
 *
 * This deliberately does NOT repeat the determinism + replay triple on every
 * seed; Phase 0A and 0B already prove those on fixed seeds, and repeating them
 * 90 times would triple the cost while adding little. The sweep is for what it
 * is uniquely good at: finding rare game-loop failures across many random
 * states.
 *
 * Each run is checked live only. Every failure is COLLECTED rather than
 * throwing on the first one, so a single bad seed cannot mask the rest. Only
 * failing seeds then get the expensive diagnostics (rerun for determinism,
 * replay the transcript) so a failure arrives pre-classified.
 *
 * Seeds are fixed and derived from the pairing, never from the clock, so any
 * failure is exactly reproducible. Set OPTCG_SWEEP_SEEDS to widen it for an
 * opt-in stress run.
 */
const DECK_IDS: readonly DeckId[] = ["newgate", "yamato", "xebec"];
const PAIRINGS: readonly (readonly [DeckId, DeckId])[] = DECK_IDS.flatMap((south) =>
  DECK_IDS.map((north) => [south, north] as const),
);

/**
 * Default kept low so the normal `vp test` path stays fast: 9 pairings x 10
 * seeds is 90 games and ~144s, which more than doubled the suite. The full
 * 10-seed sweep and wider stress runs are opt-in and fully reproducible:
 *   OPTCG_SWEEP_SEEDS=10   the standard sweep (90 games)
 *   OPTCG_SWEEP_SEEDS=100  stress (900 games)
 */
const SEEDS_PER_PAIRING = Number(process.env.OPTCG_SWEEP_SEEDS ?? "2");

/**
 * Both turn orders. With a single firstPlayer, seat and turn order are
 * perfectly correlated, so seat effects, turn-order effects, heuristic
 * behaviour and matchup effects are all confounded. Sweeping both separates
 * them.
 */
const FIRST_PLAYERS: readonly MatchSeat[] = ["south", "north"];
const seedFor = (south: DeckId, north: DeckId, first: MatchSeat, index: number) =>
  `phase0c:${south}-vs-${north}:first-${first}:${index}`;

interface RunStat {
  pairing: string;
  firstPlayer: MatchSeat;
  seed: string;
  winner: string | null;
  termination: string;
  turns: number;
  commands: number;
  prompts: number;
  attacks: number;
}

interface Failure extends RunStat {
  reasons: string[];
  diagnosis: string[];
}

const countType = (history: readonly EngineCommand[], type: string) =>
  history.filter((command) => command.type === type).length;

describe("Phase 0C: multi-seed sweep", () => {
  test(`all ${PAIRINGS.length} pairings x ${FIRST_PLAYERS.length} turn orders x ${SEEDS_PER_PAIRING} seeds play clean games`, () => {
    const stats: RunStat[] = [];
    const failures: Failure[] = [];

    for (const [south, north] of PAIRINGS) {
      const pairing = `${south}->${north}`;
      for (const firstPlayer of FIRST_PLAYERS) {
        for (let index = 0; index < SEEDS_PER_PAIRING; index++) {
          const seed = seedFor(south, north, firstPlayer, index);
          const config = matchConfig(south, north, seed, firstPlayer);
          const result = runBotMatch(
            config,
            { south: heuristicAgent, north: heuristicAgent },
            { maxCommands: MAX_COMMANDS, seed },
          );

          const stat: RunStat = {
            pairing,
            firstPlayer,
            seed,
            winner: result.winner,
            termination: result.termination,
            turns: result.finalState.turnNumber,
            commands: result.totalCommands,
            prompts: countType(result.commandHistory, "resolvePrompt"),
            attacks: countType(result.commandHistory, "declareAttack"),
          };
          stats.push(stat);

          const reasons: string[] = [];
          if (result.termination !== "rules-win") {
            reasons.push(`termination=${result.termination}`);
          }
          if (result.illegalCommands !== 0) {
            reasons.push(`illegalCommands=${result.illegalCommands}`);
          }
          if (result.winner === null) reasons.push("winner=null");
          const pending = result.finalState.promptQueue.filter((p) => p.status === "pending");
          if (pending.length > 0) reasons.push(`strandedPrompts=${pending.length}`);
          if (result.finalState.resolutionQueue.length > 0) {
            reasons.push(`strandedResolutions=${result.finalState.resolutionQueue.length}`);
          }
          if (result.finalState.battle) reasons.push("strandedBattle");

          if (reasons.length === 0) continue;

          // Only failing seeds pay for the expensive diagnostics.
          const diagnosis: string[] = [];
          const rerun = runBotMatch(
            config,
            { south: heuristicAgent, north: heuristicAgent },
            { maxCommands: MAX_COMMANDS, seed },
          );
          diagnosis.push(
            JSON.stringify(rerun.commandHistory) === JSON.stringify(result.commandHistory)
              ? "deterministic"
              : "NONDETERMINISTIC",
          );
          const replayed = replayMatch(config, result.commandHistory);
          const rejected = replayed.results
            .map((entry, i) => ({ entry, i }))
            .filter(({ entry }) => !entry.accepted);
          diagnosis.push(
            rejected.length === 0
              ? "replay: all accepted"
              : `replay rejected ${rejected.length}: ${rejected
                  .slice(0, 2)
                  .map(
                    ({ entry, i }) =>
                      `#${i} ${result.commandHistory[i]?.type} -> ${entry.reason ?? "no reason"}`,
                  )
                  .join("; ")}`,
          );

          failures.push({ ...stat, reasons, diagnosis });
        }
      }
    }

    // Diagnostics for passing runs too: a seed that suddenly needs 3800
    // commands while the rest need ~100 is evidence of an emerging loop even
    // though it technically reached rules-win.
    const commands = stats.map((stat) => stat.commands);
    const turns = stats.map((stat) => stat.turns);
    const summary = {
      games: stats.length,
      failures: failures.length,
      commands: { min: Math.min(...commands), max: Math.max(...commands) },
      turns: { min: Math.min(...turns), max: Math.max(...turns) },
      southWins: stats.filter((stat) => stat.winner === "south").length,
      northWins: stats.filter((stat) => stat.winner === "north").length,
      // Separates turn order from seat: wins by the player who went first.
      firstPlayerWins: stats.filter((stat) => stat.winner === stat.firstPlayer).length,
    };
    // eslint-disable-next-line no-console
    console.log(`SWEEP ${JSON.stringify(summary)}`);
    const worst = [...stats].sort((a, b) => b.commands - a.commands).slice(0, 3);
    // eslint-disable-next-line no-console
    console.log(
      `SWEEP longest: ${worst
        .map((stat) => `${stat.seed} cmds=${stat.commands} turns=${stat.turns}`)
        .join(" | ")}`,
    );

    expect(stats).toHaveLength(PAIRINGS.length * FIRST_PLAYERS.length * SEEDS_PER_PAIRING);
    expect(failures).toEqual([]);
  }, 600_000);
});
