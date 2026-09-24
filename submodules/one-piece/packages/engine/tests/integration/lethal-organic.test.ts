import { describe, expect, test } from "vite-plus/test";

import { replayMatch } from "../../src/core.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import { createSearchWorld } from "../../src/analysis/search-world.ts";
import { findLethal } from "../../src/analysis/lethal.ts";
import { MAX_COMMANDS, matchConfig } from "./deck-fixtures.ts";
import "@tcg/op-cards";

/**
 * Organic lethal sanity check (1C-2R).
 *
 * Every other lethal fixture is synthetic, built to have a known answer. This
 * one is reached organically, by replaying a deterministic Phase 0 transcript,
 * so the solver is exercised on a state no one designed.
 *
 * Pinned: the position, the perspective, the horizon, the verdict and the
 * best-defence mate distance, plus a replayable, legal principal variation.
 *
 * Deliberately NOT pinned: that this is the EARLIEST provable cut. That is a
 * property of depth limits, budgets and future solver optimisations, and
 * coupling correctness to it would make the test brittle. (For the record,
 * cut 102 is no-forced-win within 4 plies, so at this horizon 103 is the
 * earliest, five commands before the game ended.)
 *
 * Coupling, stated plainly: the position is reached through the heuristic
 * agent's play. If that agent changes, the transcript changes. The identity
 * checks below make that fail as an explicit "transcript changed, rediscover
 * the cut" rather than as a mysterious solver regression.
 */
const SEED = "phase0b-newgate-vs-xebec";
const CUT = 103;
const PERSPECTIVE = "north" as const;
const MAX_PLIES = 4;

describe("organic lethal: Newgate vs Xebec", () => {
  test(`cut ${CUT} is a forced win for north within ${MAX_PLIES} plies`, () => {
    const config = () => matchConfig("newgate", "xebec", SEED);
    const live = runBotMatch(
      config(),
      { south: heuristicAgent, north: heuristicAgent },
      { maxCommands: MAX_COMMANDS, seed: SEED },
    );

    // Transcript identity. If these move, the fixture must be rediscovered.
    expect(live.termination).toBe("rules-win");
    expect(live.winner).toBe(PERSPECTIVE);
    expect(live.commandHistory).toHaveLength(108);

    const state = replayMatch(config(), live.commandHistory.slice(0, CUT)).state;
    expect(state.status).toBe("active");
    const world = createSearchWorld(state, PERSPECTIVE);

    const result = findLethal(world, { maxPlies: MAX_PLIES });

    expect(result.status).toBe("forced-win");
    if (result.status !== "forced-win") return;
    expect(result.plies).toBe(4);

    // The principal variation is replayable, legal at every node, and ends in
    // a win for the perspective player.
    let node = world;
    for (const command of result.line) {
      expect(node.legalActions(node.seatToAct()).map((a) => JSON.stringify(a))).toContain(
        JSON.stringify(command),
      );
      const step = node.apply(command);
      expect(step.accepted).toBe(true);
      node = step.world;
    }
    expect(node.isTerminal()).toBe(true);
    expect(node.winner()).toBe(PERSPECTIVE);
  }, 60_000);
});
