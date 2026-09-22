import { describe, expect, test } from "vite-plus/test";

import { createMatch } from "../../src/core.ts";
import { getLegalCommands } from "../../src/engine/legal.ts";
import { createSearchWorld } from "../../src/analysis/search-world.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import type { EngineCommand, LegalCommandDescriptor } from "../../src/types.ts";
import { MAX_COMMANDS, matchConfig } from "./deck-fixtures.ts";
import "@tcg/op-cards";

/**
 * Phase 1A: the perfect-information analysis facade.
 *
 * These tests pin the properties a searcher depends on. They deliberately do
 * NOT test rules: the facade contains no game logic, so any rules assertion
 * here would really be testing the engine twice.
 */
const SEED = "phase1a-search-world";

/**
 * Local, faithful descriptor -> command conversion for the cases these tests
 * need. Deliberately local: the engine's commandFromDescriptor is a bot policy
 * helper that would collapse the three chooseJoKenPo descriptors into one, and
 * the facade correctly declines to expose it.
 */
const toCommand = (descriptor: LegalCommandDescriptor): EngineCommand | null => {
  if (descriptor.type === "chooseJoKenPo") {
    const choice = descriptor.options?.[0]?.value;
    if (choice !== "rock" && choice !== "paper" && choice !== "scissors") return null;
    return { type: "chooseJoKenPo", seat: descriptor.seat as "south" | "north", choice };
  }
  return null;
};

const firstJoKenPo = (descriptors: LegalCommandDescriptor[]) =>
  descriptors.find((descriptor) => descriptor.type === "chooseJoKenPo")!;
const freshWorld = () =>
  createSearchWorld(createMatch(matchConfig("newgate", "xebec", SEED)), "south");

describe("SearchWorld facade", () => {
  test("legalActions delegates to the engine rather than reimplementing it", () => {
    const world = freshWorld();
    expect(world.legalActions()).toEqual(getLegalCommands(world.state, world.state.activeSeat));
    // A seat may be named explicitly, judge included.
    expect(world.legalActions("judge")).toEqual(getLegalCommands(world.state, "judge"));
  });

  test("apply returns a NEW world and leaves the receiver untouched", () => {
    const world = freshWorld();
    const before = world.diagnosticFingerprint();
    const command = toCommand(firstJoKenPo(world.legalActions()))!;
    expect(command).not.toBeNull();

    const step = world.apply(command);

    // The branching guarantee: search may advance without cloning.
    expect(world.diagnosticFingerprint()).toBe(before);
    expect(step.world).not.toBe(world);
    expect(step.world.state).not.toBe(world.state);
    expect(step.world.perspective).toBe(world.perspective);
  });

  test("branching twice from one world yields independent successors", () => {
    const world = freshWorld();
    const actions = world.legalActions();
    expect(actions.length).toBeGreaterThan(0);

    const command = toCommand(firstJoKenPo(actions))!;
    const a = world.apply(command);
    const b = world.apply(command);

    // Same input, same result, and neither disturbed the parent.
    expect(a.accepted).toBe(b.accepted);
    expect(a.world.diagnosticFingerprint()).toBe(b.world.diagnosticFingerprint());
    expect(a.world).not.toBe(b.world);
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
    // Nothing further to search from a terminal position.
    expect(terminal.legalActions()).toEqual([]);
  });

  test("diagnosticFingerprint is stable per position and changes on advance", () => {
    const world = freshWorld();
    expect(world.diagnosticFingerprint()).toBe(world.diagnosticFingerprint());
    // A second world built from the same config is the same position.
    expect(freshWorld().diagnosticFingerprint()).toBe(world.diagnosticFingerprint());

    const step = world.apply(toCommand(firstJoKenPo(world.legalActions()))!);
    expect(step.accepted).toBe(true);
    expect(step.world.diagnosticFingerprint()).not.toBe(world.diagnosticFingerprint());
  });

  test("enumeration is 1:1 with actions and carries choices structurally", () => {
    const world = freshWorld();
    const joKenPo = world
      .legalActions()
      .filter((descriptor) => descriptor.type === "chooseJoKenPo");

    // Three distinct actions, three descriptors: the branching factor is real.
    expect(joKenPo).toHaveLength(3);
    // The choice is in `options`, not only in the human-readable label, so a
    // faithful converter needs no string parsing.
    expect(
      joKenPo
        .map((descriptor) => String(descriptor.options?.[0]?.value))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["paper", "rock", "scissors"]);

    // Each converts to a genuinely different command.
    const commands = joKenPo.map((descriptor) => toCommand(descriptor));
    expect(new Set(commands.map((command) => JSON.stringify(command))).size).toBe(3);
  });

  test("the fingerprint ignores path-dependent history", () => {
    const world = freshWorld();
    const printed = world.diagnosticFingerprint();
    for (const key of ["commandHistory", "logHistory", "eventHistory", "eventSequence"]) {
      expect(printed).not.toContain(`"${key}"`);
    }
  });
});
