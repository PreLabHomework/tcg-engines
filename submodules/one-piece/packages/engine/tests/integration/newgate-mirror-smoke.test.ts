import { describe, expect, test } from "vite-plus/test";
import type { MatchConfig } from "../../src/types.ts";

import { replayMatch } from "../../src/core.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import "@tcg/op-cards";

/**
 * Phase 0 smoke test: two real Milestone 1 decks must play a complete,
 * legal, deterministic, replayable game.
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
const NEWGATE_LEADER = "OP17-001";
const NEWGATE_MAIN: [string, number][] = [
  ["OP17-004", 2],
  ["OP17-003", 4],
  ["OP17-009", 3],
  ["OP16-118", 2],
  ["OP17-015", 4],
  ["OP17-008", 4],
  ["OP16-004", 4],
  ["OP17-006", 4],
  ["OP17-007", 4],
  ["OP16-003", 3],
  ["OP17-005", 4],
  ["OP17-017", 4],
  ["OP17-019", 4],
  ["OP16-021", 4],
];

const expand = (entries: [string, number][]) =>
  entries.flatMap(([id, count]) => Array.from({ length: count }, () => id));

const SEED = "phase0-newgate-mirror";
const MAX_COMMANDS = 5000;

const newgateMirrorConfig = (): MatchConfig => {
  const mainDeck = expand(NEWGATE_MAIN);
  expect(mainDeck).toHaveLength(50);
  return {
    firstPlayer: "south",
    seed: SEED,
    shuffleDecks: true,
    openingHandSize: 5,
    skipFirstTurnDraw: true,
    maxCharacterSlots: 5,
    players: {
      south: { leaderCardId: NEWGATE_LEADER, mainDeck: [...mainDeck], playerName: "South Newgate" },
      north: { leaderCardId: NEWGATE_LEADER, mainDeck: [...mainDeck], playerName: "North Newgate" },
    },
  };
};

const runMirror = () =>
  runBotMatch(
    newgateMirrorConfig(),
    { south: heuristicAgent, north: heuristicAgent },
    { maxCommands: MAX_COMMANDS, seed: SEED },
  );

describe("Phase 0: Newgate mirror, heuristic vs heuristic", () => {
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

    const replayed = replayMatch(newgateMirrorConfig(), live.commandHistory);

    const rejected = replayed.results.filter((entry) => !entry.accepted);
    expect(rejected).toEqual([]);
    expect(replayed.state.winner).toEqual(live.winner);
    expect(replayed.state).toEqual(live.finalState);
  });
});
