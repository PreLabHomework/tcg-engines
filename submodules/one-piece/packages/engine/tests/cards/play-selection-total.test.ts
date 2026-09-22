import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op12Fullbody052 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { registerCards } from "../../../cards/src/runtime-catalog.ts";

/**
 * Unit coverage for `PlayAction.selectionTotal`.
 *
 * Printed text of the form "play up to N cards ... with a total cost of X or
 * less" constrains the chosen SET, not each card. A per-card `cost <= X`
 * filter would wrongly admit two cards that each pass but together exceed the
 * budget, which is exactly what the parser produced for OP17-118.
 *
 * Three constraints must hold together: cardinality (<= 2), pairwise
 * uniqueness (differentNames), and the aggregate budget (total cost <= 9).
 */
const mk = (suffix: string, name: string, cost: number, trait: string): CharacterCard => ({
  ...op12Fullbody052,
  id: `TEST-SEL-${suffix}`,
  canonicalId: `TEST-SEL-${suffix}`,
  slug: `test-sel-${suffix.toLowerCase()}`,
  name,
  cost,
  traits: [trait],
  effects: undefined,
});

const A = mk("A", "Sel A", 4, "Rocks Pirates");
const B = mk("B", "Sel B", 5, "Rocks Pirates");
const C = mk("C", "Sel C", 6, "Rocks Pirates");
const D = mk("D", "Sel D", 9, "Rocks Pirates");
const A2 = mk("A2", "Sel A", 4, "Rocks Pirates"); // same NAME as A
/** Individually over budget: can belong to no legal selection at all. */
const Ten = mk("TEN", "Sel Ten", 10, "Rocks Pirates");
const X = mk("X", "Sel X", 1, "Straw Hat Crew"); // wrong trait

const source: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-SEL-SOURCE",
  canonicalId: "TEST-SEL-SOURCE",
  slug: "test-sel-source",
  name: "Test Selection Source",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [
          {
            action: "play",
            source: { player: "self", zone: "hand" },
            count: { amount: 2, upTo: true },
            differentNames: true,
            selectionTotal: { property: "cost", comparison: "lte", value: 9 },
            filters: [{ filter: "trait", value: "Rocks Pirates", match: "includes" }],
          },
        ],
      },
    ],
  },
};
registerCards([A, B, C, D, A2, X, Ten, source]);

describe("PlayAction.selectionTotal", () => {
  const setup = () => {
    const engine = OnePieceTestEngine.create(
      {
        hand: [
          { card: source },
          { card: A },
          { card: A2 },
          { card: B },
          { card: C },
          { card: D },
          { card: X },
          { card: Ten },
        ],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    engine.play(source, "south");
    const step = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (step?.kind !== "selectEntity") throw new Error("Expected the play-selection prompt.");
    const byName = (name: string) =>
      step.candidates.find(
        (candidate) => engine.getState().cards[candidate.ref.id]?.cardId === name,
      )?.ref.id;
    return { engine, step, byName };
  };

  test("the wrong-trait card is excluded from candidates entirely", () => {
    const { step, byName } = setup();
    expect(byName(X.id)).toBeUndefined();
    // A, A2, B, C, D only. Ten is trait-eligible but individually over the
    // budget, so it must not be offered either.
    expect(byName(Ten.id)).toBeUndefined();
    expect(step.candidates).toHaveLength(5);
  });

  test("prompt legality: an individually over-budget candidate is not offered", () => {
    const { engine, step, byName } = setup();
    const ids = step.candidates.map((candidate) => candidate.ref.id);

    // Every option a prompt presents must be selectable in at least one legal
    // resolution. "Up to 2, total <= 9" makes a single pick legal, so a card
    // whose own cost exceeds 9 belongs to no legal selection and offering it
    // would violate that contract.
    expect(byName(Ten.id)).toBeUndefined();
    for (const card of [A, B, C, D]) {
      expect(ids).toContain(byName(card.id)!);
    }
    engine.resolveDecision("effectPlaySelection", { selectedIds: [] }, "south");
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("A + A2 is rejected: same card name, even though the total is only 8", () => {
    const { engine, step } = setup();
    const sameName = step.candidates.filter(
      (candidate) => engine.getState().cards[candidate.ref.id]?.cardId !== undefined,
    );
    const aIds = sameName
      .filter((candidate) => {
        const cardId = engine.getState().cards[candidate.ref.id]?.cardId;
        return cardId === A.id || cardId === A2.id;
      })
      .map((candidate) => candidate.ref.id);
    expect(aIds).toHaveLength(2);
    expect(() =>
      engine.resolveDecision("effectPlaySelection", { selectedIds: aIds }, "south"),
    ).toThrow();
  });

  test("the prompt is an atomic multi-select, so the budget is enforced on submission", () => {
    const { engine } = setup();
    const prompt = engine.getView("south").prompts[0];
    // One prompt takes both picks at once, capped at the cardinality. There is
    // therefore no intermediate per-pick state in which an over-budget pair
    // could be committed and only caught afterwards: an illegal combination is
    // refused at submission and nothing is played.
    expect(prompt?.maxSelections).toBe(2);
    expect(prompt?.minSelections).toBe(0);
    expect(engine.getView("south").prompts).toHaveLength(1);
  });

  test("A + B is legal: two different names totalling exactly 9", () => {
    const { engine, byName } = setup();
    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [byName(A.id)!, byName(B.id)!] },
      "south",
    );
    const board = engine
      .getView("south")
      .players.south.characters.filter(Boolean)
      .map((card) => card?.cardId);
    expect(board).toContain(A.id);
    expect(board).toContain(B.id);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("A + C is rejected: different names but totalling 10", () => {
    const { engine, byName } = setup();
    expect(() =>
      engine.resolveDecision(
        "effectPlaySelection",
        { selectedIds: [byName(A.id)!, byName(C.id)!] },
        "south",
      ),
    ).toThrow();
  });

  test("D alone is legal: 'up to 2' permits a single pick at the budget", () => {
    const { engine, byName } = setup();
    engine.resolveDecision("effectPlaySelection", { selectedIds: [byName(D.id)!] }, "south");
    const board = engine
      .getView("south")
      .players.south.characters.filter(Boolean)
      .map((card) => card?.cardId);
    expect(board).toContain(D.id);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("D plus anything is rejected: 9 already exhausts the budget", () => {
    const { engine, byName } = setup();
    expect(() =>
      engine.resolveDecision(
        "effectPlaySelection",
        { selectedIds: [byName(D.id)!, byName(A.id)!] },
        "south",
      ),
    ).toThrow();
  });

  test("selecting more than 2 is rejected by cardinality", () => {
    const { engine, byName } = setup();
    expect(() =>
      engine.resolveDecision(
        "effectPlaySelection",
        { selectedIds: [byName(A.id)!, byName(B.id)!, byName(C.id)!] },
        "south",
      ),
    ).toThrow();
  });
});
