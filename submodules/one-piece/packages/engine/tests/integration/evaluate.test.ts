import { describe, expect, test } from "vite-plus/test";
import type { MatchState } from "../../src/types.ts";
import { op17Jozu008, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { createSearchWorld } from "../../src/analysis/search-world.ts";
import { DEFAULT_WEIGHTS, WIN_SCORE, evaluatePosition } from "../../src/analysis/evaluate.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import { MAX_COMMANDS, matchConfig } from "./deck-fixtures.ts";

/**
 * Evaluator v0 tests.
 *
 * These pin monotonicity and structure, NOT playing strength. v0 is meant to
 * be a trustworthy numerical interface, not a good player.
 */
interface SideSpec {
  life?: number;
  hand?: number;
  characters?: { rested?: boolean }[];
  activeDon?: number;
}

const build = (south: SideSpec, north: SideSpec): MatchState => {
  const side = (spec: SideSpec) => ({
    leaderCardId: op17RocksDXebec039,
    life: spec.life ?? 3,
    hand: Array.from({ length: spec.hand ?? 2 }, () => ({ card: op17Jozu008 })),
    character: (spec.characters ?? []).map((character) => ({
      card: op17Jozu008,
      rested: character.rested ?? false,
      playedOnTurn: 0,
    })),
    activeDon: spec.activeDon ?? 5,
  });
  return OnePieceTestEngine.create(side(south), side(north), {
    firstPlayer: "south",
    activeSeat: "south",
  }).getState();
};

const scoreOf = (south: SideSpec, north: SideSpec, seat: "south" | "north" = "south") =>
  evaluatePosition(createSearchWorld(build(south, north), seat), seat).total;

const BASE: SideSpec = { life: 3, hand: 2, characters: [{}], activeDon: 5 };

describe("evaluator v0", () => {
  test("contributions sum exactly to the total", () => {
    const breakdown = evaluatePosition(
      createSearchWorld(build({ ...BASE, life: 4, hand: 3 }, BASE), "south"),
      "south",
    );
    const summed = Object.values(breakdown.features).reduce(
      (sum, feature) => sum + feature.contribution,
      0,
    );
    expect(breakdown.terminal).toBe(false);
    expect(summed).toBe(breakdown.total);
    // And each term's own arithmetic is self-consistent.
    for (const feature of Object.values(breakdown.features)) {
      expect(feature.delta).toBe(feature.own - feature.opponent);
      expect(feature.contribution).toBe(feature.delta * feature.weight);
    }
  });

  test("perspective antisymmetry: south total is the negation of north's", () => {
    const state = build({ ...BASE, life: 4, hand: 3, characters: [{}, {}] }, BASE);
    const south = evaluatePosition(createSearchWorld(state, "south"), "south").total;
    const north = evaluatePosition(createSearchWorld(state, "north"), "north").total;
    expect(south).toBe(-north);
    expect(south).not.toBe(0);
  });

  test("a life advantage increases the score", () => {
    expect(scoreOf({ ...BASE, life: 4 }, BASE)).toBeGreaterThan(scoreOf(BASE, BASE));
    expect(scoreOf({ ...BASE, life: 2 }, BASE)).toBeLessThan(scoreOf(BASE, BASE));
  });

  test("a hand advantage increases the score", () => {
    expect(scoreOf({ ...BASE, hand: 5 }, BASE)).toBeGreaterThan(scoreOf(BASE, BASE));
  });

  test("a larger board increases the score, in bodies and in power", () => {
    const bigger = scoreOf({ ...BASE, characters: [{}, {}, {}] }, BASE);
    expect(bigger).toBeGreaterThan(scoreOf(BASE, BASE));

    const breakdown = evaluatePosition(
      createSearchWorld(build({ ...BASE, characters: [{}, {}, {}] }, BASE), "south"),
      "south",
    );
    expect(breakdown.features.boardBodies.delta).toBe(2);
    // Three 8000-power Jozus against one, measured in units of 1000.
    expect(breakdown.features.boardPower.delta).toBe(16);
  });

  test("ready attack pressure increases the score independently of board size", () => {
    // Same bodies and power on both sides; only rested state differs.
    const ready = scoreOf({ ...BASE, characters: [{}, {}] }, { ...BASE, characters: [{}, {}] });
    const rested = scoreOf(
      { ...BASE, characters: [{ rested: true }, { rested: true }] },
      { ...BASE, characters: [{}, {}] },
    );
    expect(ready).toBeGreaterThan(rested);
  });

  test("an active DON!! advantage increases the score", () => {
    expect(scoreOf({ ...BASE, activeDon: 9 }, BASE)).toBeGreaterThan(scoreOf(BASE, BASE));
  });

  test("a terminal win outscores any positional advantage, and a loss undercuts any deficit", () => {
    const seed = "phase1b-eval";
    const finished = runBotMatch(
      matchConfig("newgate", "xebec", seed),
      { south: heuristicAgent, north: heuristicAgent },
      { maxCommands: MAX_COMMANDS, seed },
    );
    const winner = finished.winner as "south" | "north";
    const loser = winner === "south" ? "north" : "south";

    const won = evaluatePosition(createSearchWorld(finished.finalState, winner), winner);
    const lost = evaluatePosition(createSearchWorld(finished.finalState, loser), loser);
    expect(won.terminal).toBe(true);
    expect(won.total).toBe(WIN_SCORE);
    expect(lost.total).toBe(-WIN_SCORE);

    // A crushing but non-terminal position must still score far below a win.
    const crushing = scoreOf(
      { life: 5, hand: 10, characters: [{}, {}, {}, {}, {}], activeDon: 10 },
      { life: 1, hand: 0, characters: [], activeDon: 0 },
    );
    expect(crushing).toBeGreaterThan(0);
    expect(crushing).toBeLessThan(WIN_SCORE);
    expect(-crushing).toBeGreaterThan(-WIN_SCORE);
  });

  test("weights are overridable without touching the feature maths", () => {
    const state = build({ ...BASE, life: 5 }, BASE);
    const world = createSearchWorld(state, "south");
    const withDefault = evaluatePosition(world, "south");
    const doubled = evaluatePosition(world, "south", { ...DEFAULT_WEIGHTS, life: 600 });

    expect(doubled.features.life.delta).toBe(withDefault.features.life.delta);
    expect(doubled.features.life.contribution).toBe(withDefault.features.life.contribution * 2);
  });
});
