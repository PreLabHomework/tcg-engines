import { describe, expect, test } from "vite-plus/test";
import type { EngineCommand } from "../../src/types.ts";

import { applyCommand, createMatch } from "../../src/core.ts";
import { createSearchWorld } from "../../src/analysis/search-world.ts";
import { expandLegalActions } from "../../src/analysis/expand-actions.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import { MAX_COMMANDS, matchConfig } from "./deck-fixtures.ts";
import "@tcg/op-cards";

/**
 * Phase 1A: the perfect-information analysis facade.
 *
 * Pins the properties a searcher depends on. Deliberately NOT rules tests:
 * the facade contains no game logic.
 */
const SEED = "phase1a-search-world";
const freshWorld = () =>
  createSearchWorld(createMatch(matchConfig("newgate", "xebec", SEED)), "south");

const joKenPo = (actions: readonly EngineCommand[]) =>
  actions.filter((action) => action.type === "chooseJoKenPo");

describe("SearchWorld facade", () => {
  test("legalActions exposes concrete commands, not descriptors", () => {
    const world = freshWorld();
    const actions = world.legalActions();

    expect(actions.length).toBeGreaterThan(0);
    // Every action is directly applicable: no `options`/`slotChoices` summary
    // fields, and every one is accepted by the engine.
    for (const action of actions) {
      expect(action).not.toHaveProperty("options");
      expect(action).not.toHaveProperty("slotChoices");
      expect(applyCommand(world.state, action).accepted).toBe(true);
    }
    expect(actions).toEqual(expandLegalActions(world.state, world.state.activeSeat));
  });

  test("apply returns a NEW world and leaves the receiver untouched", () => {
    const world = freshWorld();
    const before = world.diagnosticFingerprint();
    const action = joKenPo(world.legalActions())[0]!;

    const step = world.apply(action);

    // The branching guarantee: search may advance without cloning.
    expect(step.accepted).toBe(true);
    expect(world.diagnosticFingerprint()).toBe(before);
    expect(step.world).not.toBe(world);
    expect(step.world.state).not.toBe(world.state);
    expect(step.world.perspective).toBe(world.perspective);
  });

  test("branching twice from one world yields independent successors", () => {
    const world = freshWorld();
    const action = joKenPo(world.legalActions())[0]!;

    const a = world.apply(action);
    const b = world.apply(action);

    expect(a.accepted).toBe(b.accepted);
    expect(a.world.diagnosticFingerprint()).toBe(b.world.diagnosticFingerprint());
    expect(a.world).not.toBe(b.world);
  });

  test("distinct actions lead to distinct successor positions", () => {
    const world = freshWorld();
    const choices = joKenPo(world.legalActions());
    expect(choices).toHaveLength(3);

    const fingerprints = choices.map((action) => world.apply(action).world.diagnosticFingerprint());
    // If expansion had collapsed the three choices, these would coincide.
    expect(new Set(fingerprints).size).toBe(3);
  });

  test("a rejected command is reported, not thrown, and still yields a world", () => {
    const world = freshWorld();
    const step = world.apply({ type: "endTurn", seat: "north" });

    expect(step.accepted).toBe(false);
    expect(step.reason).toBeTruthy();
    expect(step.world).toBeDefined();
  });

  test("isTerminal and winner reflect a finished game", () => {
    const fresh = freshWorld();
    expect(fresh.isTerminal()).toBe(false);
    expect(fresh.winner()).toBeNull();

    const finished = runBotMatch(
      matchConfig("newgate", "xebec", SEED),
      { south: heuristicAgent, north: heuristicAgent },
      { maxCommands: MAX_COMMANDS, seed: SEED },
    );
    const terminal = createSearchWorld(finished.finalState, "south");

    expect(terminal.isTerminal()).toBe(true);
    expect(terminal.winner()).toBe(finished.winner);
    expect(terminal.legalActions()).toEqual([]);
  });

  test("diagnosticFingerprint is stable per position and changes on advance", () => {
    const world = freshWorld();
    expect(world.diagnosticFingerprint()).toBe(world.diagnosticFingerprint());
    expect(freshWorld().diagnosticFingerprint()).toBe(world.diagnosticFingerprint());

    const step = world.apply(joKenPo(world.legalActions())[0]!);
    expect(step.accepted).toBe(true);
    expect(step.world.diagnosticFingerprint()).not.toBe(world.diagnosticFingerprint());
  });

  test("the fingerprint ignores path-dependent history", () => {
    const printed = freshWorld().diagnosticFingerprint();
    for (const key of ["commandHistory", "logHistory", "eventHistory", "eventSequence"]) {
      expect(printed).not.toContain(`"${key}"`);
    }
  });
});
