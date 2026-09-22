import { describe, expect, test } from "vite-plus/test";
import type { MatchConfig } from "../../src/types.ts";

import { replayMatch } from "../../src/core.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import "@tcg/op-cards";

/**
 * Phase 0 smoke test: OP17 Rocks.D.Xebec mirror.
 *
 * Structurally identical to the other two mirrors on purpose; a shared
 * helper is worth extracting only once all three pass.
 *
 * This deck is the densest test of the engine work done for Milestone 1:
 * PlayAction.selectionTotal, opponent-choice effects, removal-replacement
 * effects, the whenFriendlyCardAttacks observer, attack restrictions, and
 * the [Once Per Turn] turn-boundary reset.
 *
 * This is a game-loop correctness test, not an agent-quality one. Both seats
 * use the heuristic strategy, which is an `oracle` agent (it sees hidden
 * information). That is deliberate and fine here: we are proving the engine
 * can run a full match without illegal commands or stranded state, not that
 * the agents play fairly.
 *
 * Nothing new is built. runBotMatch already runs to terminal and records a
 * command transcript, and core.ts already exports replayMatch.
 */
const XEBEC_LEADER = "OP17-039";
const XEBEC_MAIN: [string, number][] = [
  ["OP08-051", 4],
  ["OP17-045", 4],
  ["OP17-054", 4],
  ["OP17-041", 2],
  ["OP17-042", 2],
  ["OP17-044", 4],
  ["OP17-046", 4],
  ["OP17-049", 4],
  ["OP17-040", 4],
  ["OP17-048", 4],
  ["OP17-118", 4],
  ["OP17-055", 4],
  ["OP17-056", 4],
  ["EB02-030", 2],
];

const expand = (entries: [string, number][]) =>
  entries.flatMap(([id, count]) => Array.from({ length: count }, () => id));

const SEED = "phase0-xebec-mirror";
const MAX_COMMANDS = 5000;

const xebecMirrorConfig = (): MatchConfig => {
  const mainDeck = expand(XEBEC_MAIN);
  expect(mainDeck).toHaveLength(50);
  return {
    firstPlayer: "south",
    seed: SEED,
    shuffleDecks: true,
    openingHandSize: 5,
    skipFirstTurnDraw: true,
    maxCharacterSlots: 5,
    players: {
      south: { leaderCardId: XEBEC_LEADER, mainDeck: [...mainDeck], playerName: "South Xebec" },
      north: { leaderCardId: XEBEC_LEADER, mainDeck: [...mainDeck], playerName: "North Xebec" },
    },
  };
};

const runMirror = () =>
  runBotMatch(
    xebecMirrorConfig(),
    { south: heuristicAgent, north: heuristicAgent },
    { maxCommands: MAX_COMMANDS, seed: SEED },
  );

describe("Phase 0: Xebec mirror, heuristic vs heuristic", () => {
  test("plays a complete, legal game leaving no unresolved state", () => {
    const result = runMirror();

    // max-actions here would mean the match is effectively stuck, not that
    // the ceiling was too low: 5000 is far above a normal game.
    expect(result.termination).toBe("rules-win");
    expect(result.illegalCommands).toBe(0);
    expect(result.stuck).toBe(false);
    expect(result.winner).not.toBeNull();

    const state = result.finalState;
    expect(state.status).toBe("finished");
    // Both queues, not just prompts: a stranded resolution item would
    // otherwise pass unnoticed.
    expect(state.promptQueue.filter((prompt) => prompt.status === "pending")).toEqual([]);
    expect(state.resolutionQueue).toEqual([]);
    expect(state.battle ?? null).toBeNull();
  });

  test("the transcript actually exercises the interactive effect machinery", () => {
    const result = runMirror();

    expect(result.commandHistory.length).toBeGreaterThan(0);
    // Without at least one prompt resolution, a replay test could pass while
    // never touching the effect/prompt machinery these decks are built on.
    const promptCommands = result.commandHistory.filter(
      (command) => command.type === "resolvePrompt",
    );
    expect(promptCommands.length).toBeGreaterThan(0);

    // The match must get well past opening setup. Deliberately NOT asserting
    // that any particular card was played: the heuristic bot's choices are
    // not part of the rules contract.
    expect(result.finalState.turnNumber).toBeGreaterThan(4);
    const setupTypes = new Set(["chooseJoKenPo", "chooseFirstPlayer", "keepHand", "startGame"]);
    const inGameCommands = result.commandHistory.filter((command) => !setupTypes.has(command.type));
    expect(inGameCommands.length).toBeGreaterThan(20);
  });

  test("is deterministic: the same config and seed reproduce the run exactly", () => {
    const a = runMirror();
    const b = runMirror();

    expect(b.winner).toEqual(a.winner);
    expect(b.termination).toEqual(a.termination);
    expect(b.totalCommands).toEqual(a.totalCommands);
    expect(b.commandHistory).toEqual(a.commandHistory);
    // Full state, logs and event history included. If gameplay state matches
    // but this does not, some supposedly deterministic metadata is not.
    expect(b.finalState).toEqual(a.finalState);
  });

  test("replaying the transcript reproduces the identical game", () => {
    const live = runMirror();

    const replayed = replayMatch(xebecMirrorConfig(), live.commandHistory);

    const rejected = replayed.results.filter((entry) => !entry.accepted);
    expect(rejected).toEqual([]);
    expect(replayed.state.winner).toEqual(live.winner);
    expect(replayed.state).toEqual(live.finalState);
  });
});
