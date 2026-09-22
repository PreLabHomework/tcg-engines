import { describe, expect, test } from "vite-plus/test";

import { replayMatch } from "../../src/core.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import { DECKS, MAX_COMMANDS, matchConfig, type DeckId } from "./deck-fixtures.ts";
import "@tcg/op-cards";

/**
 * Phase 0B: the six ordered cross-matchups.
 *
 * Exactly the Phase 0A contract, applied to decks that now interact rather
 * than mirror. Deliberately NO card-specific assertions: these are whole-game
 * smoke tests, and the heuristic bot's choices are not part of the rules
 * contract.
 *
 * Ordered most-interactive first, so a cross-deck engine problem surfaces
 * early rather than after four passing matchups.
 */
const PAIRINGS: readonly (readonly [DeckId, DeckId])[] = [
  ["yamato", "xebec"],
  ["xebec", "yamato"],
  ["newgate", "xebec"],
  ["xebec", "newgate"],
  ["newgate", "yamato"],
  ["yamato", "newgate"],
];

const seedFor = (south: DeckId, north: DeckId) => `phase0b-${south}-vs-${north}`;

const runPairing = (south: DeckId, north: DeckId) =>
  runBotMatch(
    matchConfig(south, north, seedFor(south, north)),
    { south: heuristicAgent, north: heuristicAgent },
    { maxCommands: MAX_COMMANDS, seed: seedFor(south, north) },
  );

describe("Phase 0B: ordered cross-matchups", () => {
  for (const [south, north] of PAIRINGS) {
    describe(`${DECKS[south].label} (south) vs ${DECKS[north].label} (north)`, () => {
      test("plays a complete, legal game leaving no unresolved state", () => {
        const result = runPairing(south, north);

        expect(result.termination).toBe("rules-win");
        expect(result.illegalCommands).toBe(0);
        expect(result.stuck).toBe(false);
        expect(result.winner).not.toBeNull();

        const state = result.finalState;
        expect(state.status).toBe("finished");
        expect(state.promptQueue.filter((prompt) => prompt.status === "pending")).toEqual([]);
        expect(state.resolutionQueue).toEqual([]);
        expect(state.battle ?? null).toBeNull();

        // The transcript must exercise the interactive effect machinery.
        expect(
          result.commandHistory.filter((command) => command.type === "resolvePrompt").length,
        ).toBeGreaterThan(0);
      }, 30_000);

      test("is deterministic: the same config and seed reproduce the run exactly", () => {
        const a = runPairing(south, north);
        const b = runPairing(south, north);

        expect(b.winner).toEqual(a.winner);
        expect(b.termination).toEqual(a.termination);
        expect(b.totalCommands).toEqual(a.totalCommands);
        expect(b.commandHistory).toEqual(a.commandHistory);
        expect(b.finalState).toEqual(a.finalState);
      }, 30_000);

      test("replaying the transcript reproduces the identical game", () => {
        const live = runPairing(south, north);

        const replayed = replayMatch(
          matchConfig(south, north, seedFor(south, north)),
          live.commandHistory,
        );

        expect(replayed.results.filter((entry) => !entry.accepted)).toEqual([]);
        expect(replayed.state.winner).toEqual(live.winner);
        expect(replayed.state).toEqual(live.finalState);
      }, 30_000);
    });
  }
});
