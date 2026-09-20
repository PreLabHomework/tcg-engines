import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op08Buckin051, op12Fullbody052, op17RocksDXebec118 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";
import { registerCards } from "../../../../cards/src/runtime-catalog.ts";

/**
 * OP17-118 Rocks.D.Xebec
 *   If you only have Characters without a Counter, this card in your hand has
 *   a +2000 Counter.
 *   [On Play] Draw 1 card and play up to 2 {Rocks Pirates} type cards with
 *   different card names and a total cost of 9 or less from your hand.
 *
 * Three selection constraints apply at once: cardinality (<= 2), pairwise
 * uniqueness (differentNames) and an aggregate budget (selectionTotal). The
 * parser emitted the first two and silently dropped the third, which would
 * have allowed two cost-9 cards totalling 18.
 *
 * {Rocks Pirates} is BRACED, so rule 2-4-3 makes it an exact type match.
 * OP08-051 Buckin is "Former Rocks Pirates" and must be excluded here, even
 * though it qualifies for this deck's quoted "Rocks Pirates" effects.
 */
const rp = (suffix: string, name: string, cost: number): CharacterCard => ({
  ...op12Fullbody052,
  id: `TEST-X118-${suffix}`,
  canonicalId: `TEST-X118-${suffix}`,
  slug: `test-x118-${suffix.toLowerCase()}`,
  name,
  cost,
  traits: ["Rocks Pirates"],
  effects: undefined,
});

const Two = rp("TWO", "Rocks Two", 2);
const Seven = rp("SEVEN", "Rocks Seven", 7);
const NineA = rp("NINEA", "Rocks Nine A", 9);
const NineB = rp("NINEB", "Rocks Nine B", 9);
const TwoDup = rp("TWODUP", "Rocks Two", 2); // same NAME as Two
registerCards([Two, Seven, NineA, NineB, TwoDup]);

describe("OP17-118 Rocks.D.Xebec", () => {
  const setup = (extra: CharacterCard[]) => {
    const engine = OnePieceTestEngine.create(
      {
        hand: [{ card: op17RocksDXebec118 }, ...extra.map((card) => ({ card }))],
        deck: [op12Fullbody052, op12Fullbody052],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const handBefore = engine.getView("south").players.south.hand.length;
    engine.play(op17RocksDXebec118, "south");
    const step = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (step?.kind !== "selectEntity") throw new Error("Expected the play-selection prompt.");
    const idOf = (card: CharacterCard) =>
      step.candidates.find(
        (candidate) => engine.getState().cards[candidate.ref.id]?.cardId === card.id,
      )?.ref.id;
    return { engine, step, idOf, handBefore };
  };

  test("draws 1 and plays two {Rocks Pirates} cards totalling exactly 9", () => {
    const { engine, idOf, handBefore } = setup([Two, Seven]);

    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [idOf(Two)!, idOf(Seven)!] },
      "south",
    );

    const view = engine.getView("south");
    const board = view.players.south.characters.filter(Boolean).map((card) => card?.cardId);
    expect(board).toContain(op17RocksDXebec118.id);
    expect(board).toContain(Two.id);
    expect(board).toContain(Seven.id);
    // Playing Xebec (-1) and drawing (+1) net out; the two picks leave hand -2.
    expect(view.players.south.hand).toHaveLength(handBefore - 2);
    expect(view.prompts).toHaveLength(0);
  });

  test("two cost-9 cards are individually eligible but rejected as a pair", () => {
    const { engine, step, idOf } = setup([NineA, NineB]);

    // Each passes the trait filter on its own.
    const ids = step.candidates.map((candidate) => candidate.ref.id);
    expect(ids).toContain(idOf(NineA)!);
    expect(ids).toContain(idOf(NineB)!);

    // Together they total 18, which selectionTotal must refuse. This is the
    // exact combination the parser's output would have allowed.
    expect(() =>
      engine.resolveDecision(
        "effectPlaySelection",
        { selectedIds: [idOf(NineA)!, idOf(NineB)!] },
        "south",
      ),
    ).toThrow();
  });

  test("a single cost-9 card is fine, since the cap is 'up to 2'", () => {
    const { engine, idOf } = setup([NineA, NineB]);
    engine.resolveDecision("effectPlaySelection", { selectedIds: [idOf(NineA)!] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.cardId)).toContain(
      NineA.id,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("two cards sharing a name are rejected despite fitting the budget", () => {
    const { engine, idOf } = setup([Two, TwoDup]);
    // Total 4, well inside the budget, but the names match.
    expect(() =>
      engine.resolveDecision(
        "effectPlaySelection",
        { selectedIds: [idOf(Two)!, idOf(TwoDup)!] },
        "south",
      ),
    ).toThrow();
  });

  test("CR 2-4-3: Buckin is Former Rocks Pirates and is not a candidate", () => {
    const { engine, step, idOf } = setup([Two, op08Buckin051 as CharacterCard]);

    expect(idOf(Two)).toBeDefined();
    // Braced {Rocks Pirates} is exact, so the Former variant does not qualify.
    expect(idOf(op08Buckin051 as CharacterCard)).toBeUndefined();
    expect(step.candidates).toHaveLength(1);

    engine.resolveDecision("effectPlaySelection", { selectedIds: [] }, "south");
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
