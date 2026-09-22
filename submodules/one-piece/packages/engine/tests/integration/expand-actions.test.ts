import { describe, expect, test } from "vite-plus/test";
import type { LegalCommandDescriptor, MatchState, PromptState } from "../../src/types.ts";

import { applyCommand, createMatch, replayMatch } from "../../src/core.ts";
import { getLegalCommands } from "../../src/engine/legal.ts";
import {
  ExpansionTooLargeError,
  UnexpandableDescriptorError,
  expandDescriptor,
  expandLegalActions,
} from "../../src/analysis/expand-actions.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import { MAX_COMMANDS, matchConfig } from "./deck-fixtures.ts";
import "@tcg/op-cards";

/**
 * Action expansion tests.
 *
 * The engine is the soundness oracle: every generated action must be accepted
 * from the state it was generated for. applyCommand is immutable, so probing
 * a child does not disturb the parent.
 */
const SEED = "phase1c-expand";
const config = () => matchConfig("newgate", "xebec", SEED);

/** A mid-game state, reached by replaying a real bot game partway. */
const midGame = (fraction: number): MatchState => {
  const live = runBotMatch(
    config(),
    { south: heuristicAgent, north: heuristicAgent },
    { maxCommands: MAX_COMMANDS, seed: SEED },
  );
  const cut = Math.floor(live.commandHistory.length * fraction);
  return replayMatch(config(), live.commandHistory.slice(0, cut)).state;
};

const fakePrompt = (
  overrides: Partial<PromptState> & Pick<PromptState, "choiceKind">,
): { state: MatchState; descriptor: LegalCommandDescriptor } => {
  const base = createMatch(config());
  const prompt: PromptState = {
    id: "prompt-test",
    kind: "choice",
    choiceKind: overrides.choiceKind,
    seat: "south",
    label: "test prompt",
    details: "",
    sourceCardId: null,
    sourceInstanceId: null,
    eventId: null,
    status: "pending",
    options: overrides.options ?? [],
    minSelections: overrides.minSelections ?? 0,
    maxSelections: overrides.maxSelections ?? 1,
    context: {},
    resolutionContext: null,
  };
  const state = { ...base, promptQueue: [prompt] } as MatchState;
  return {
    state,
    descriptor: {
      type: "resolvePrompt",
      seat: "south",
      label: prompt.label,
      promptId: prompt.id,
      options: prompt.options,
    },
  };
};

const optionsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `opt-${index}`,
    label: `opt-${index}`,
    value: `opt-${index}`,
  }));

describe("action expansion", () => {
  test("every expanded action is accepted by the engine (soundness)", () => {
    for (const fraction of [0, 0.3, 0.6, 0.9]) {
      const state = fraction === 0 ? createMatch(config()) : midGame(fraction);
      for (const seat of ["south", "north"] as const) {
        for (const action of expandLegalActions(state, seat)) {
          const result = applyCommand(state, action);
          expect({ seat, fraction, action, accepted: result.accepted }).toEqual({
            seat,
            fraction,
            action,
            accepted: true,
          });
        }
      }
    }
  });

  test("expansion is deterministic and distinct", () => {
    const state = midGame(0.6);
    const first = expandLegalActions(state, "south");
    const second = expandLegalActions(state, "south");
    expect(second).toEqual(first);
    expect(new Set(first.map((action) => JSON.stringify(action))).size).toBe(first.length);
  });

  test("chooseJoKenPo keeps rock, paper and scissors distinct", () => {
    const state = createMatch(config());
    const actions = expandLegalActions(state, "south").filter(
      (action) => action.type === "chooseJoKenPo",
    );
    expect(actions).toHaveLength(3);
    expect(actions.map((action) => (action as { choice: string }).choice).sort()).toEqual([
      "paper",
      "rock",
      "scissors",
    ]);
  });

  test("declareAttack expands to one command per legal target", () => {
    const state = midGame(0.75);
    for (const descriptor of getLegalCommands(state, state.activeSeat)) {
      if (descriptor.type !== "declareAttack") continue;
      const expanded = expandDescriptor(state, descriptor);
      expect(expanded).toHaveLength(descriptor.targetIds?.length ?? 0);
      expect(expanded.map((action) => (action as { targetId: string }).targetId)).toEqual(
        descriptor.targetIds,
      );
    }
  });

  test("playCard expands to one command per open slot", () => {
    // Scan real cuts rather than guessing a fraction: playCard is legal only
    // in the main phase with no pending prompt, which is a minority of states.
    const live = runBotMatch(
      config(),
      { south: heuristicAgent, north: heuristicAgent },
      { maxCommands: MAX_COMMANDS, seed: SEED },
    );
    let slotted = 0;
    let slotless = 0;
    for (let cut = 1; cut < live.commandHistory.length; cut++) {
      const state = replayMatch(config(), live.commandHistory.slice(0, cut)).state;
      for (const descriptor of getLegalCommands(state, state.activeSeat)) {
        if (descriptor.type !== "playCard") continue;
        const expanded = expandDescriptor(state, descriptor);
        const slots = descriptor.slotChoices ?? [];
        if (slots.length === 0) {
          // Slotless cards (events, stages) expand to exactly one command.
          expect(expanded).toHaveLength(1);
          expect(expanded[0]).not.toHaveProperty("slotIndex");
          slotless++;
        } else {
          expect(expanded).toHaveLength(slots.length);
          expect(expanded.map((a) => (a as { slotIndex?: number }).slotIndex)).toEqual(slots);
          slotted++;
        }
      }
      if (slotted > 0 && slotless > 0) break;
    }
    // Both shapes must actually have been exercised.
    expect(slotted).toBeGreaterThan(0);
    expect(slotless).toBeGreaterThan(0);
  });

  test("confirm and chooseOption expand to one command per option", () => {
    for (const choiceKind of ["confirm", "chooseOption"] as const) {
      const { state, descriptor } = fakePrompt({ choiceKind, options: optionsOf(2) });
      const expanded = expandDescriptor(state, descriptor);
      expect(expanded).toHaveLength(2);
      expect(expanded.map((action) => (action as { optionId: string }).optionId)).toEqual([
        "opt-0",
        "opt-1",
      ]);
    }
  });

  test("an optional multi-select expands to decline, singles and legal pairs", () => {
    const { state, descriptor } = fakePrompt({
      choiceKind: "selectCards",
      options: optionsOf(3),
      minSelections: 0,
      maxSelections: 2,
    });
    const expanded = expandDescriptor(state, descriptor);
    // C(3,0) + C(3,1) + C(3,2) = 1 + 3 + 3
    expect(expanded).toHaveLength(7);
    const selections = expanded.map((action) =>
      ((action as { selectedIds?: string[] }).selectedIds ?? []).join(","),
    );
    expect(selections).toContain("");
    expect(selections).toContain("opt-0");
    expect(selections).toContain("opt-0,opt-1");
  });

  test("orderCards expands to every permutation, order preserved", () => {
    const { state, descriptor } = fakePrompt({
      choiceKind: "orderCards",
      options: optionsOf(4),
      minSelections: 4,
      maxSelections: 4,
    });
    const expanded = expandDescriptor(state, descriptor);

    expect(expanded).toHaveLength(24);
    const orders = expanded.map((action) =>
      ((action as { selectedIds?: string[] }).selectedIds ?? []).join(","),
    );
    expect(new Set(orders).size).toBe(24);
    // Every command is a full permutation: all four ids, each exactly once.
    for (const action of expanded) {
      const ids = (action as { selectedIds?: string[] }).selectedIds ?? [];
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
    }
    // A,B,C,D and B,A,C,D both survive: order is not collapsed.
    expect(orders).toContain("opt-0,opt-1,opt-2,opt-3");
    expect(orders).toContain("opt-1,opt-0,opt-2,opt-3");
  });

  test("orderCards beyond budget throws and exposes no partial result", () => {
    const { state, descriptor } = fakePrompt({
      choiceKind: "orderCards",
      options: optionsOf(12),
      minSelections: 12,
      maxSelections: 12,
    });
    let thrown: unknown;
    try {
      expandDescriptor(state, descriptor, { maxActions: 1000 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ExpansionTooLargeError);
    // 12! = 479001600, counted up front rather than after allocating.
    expect((thrown as ExpansionTooLargeError).requiredBranches).toBe(479001600n);
    expect((thrown as ExpansionTooLargeError).maxActions).toBe(1000);
  });

  test("a combinatorial subset beyond budget also throws before expanding", () => {
    const { state, descriptor } = fakePrompt({
      choiceKind: "selectCards",
      options: optionsOf(40),
      minSelections: 0,
      maxSelections: 2,
    });
    // 1 + 40 + 780 = 821
    expect(expandDescriptor(state, descriptor, { maxActions: 100_000 })).toHaveLength(821);
    expect(() => expandDescriptor(state, descriptor, { maxActions: 100 })).toThrow(
      ExpansionTooLargeError,
    );
  });

  test("an unknown prompt shape fails loudly instead of guessing", () => {
    const { state, descriptor } = fakePrompt({ choiceKind: null, options: [] });
    expect(() => expandDescriptor(state, descriptor)).toThrow(UnexpandableDescriptorError);
  });
});
