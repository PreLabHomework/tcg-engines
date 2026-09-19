import { describe, expect, test } from "vite-plus/test";
import {
  op16KouzukiMomonosuke084,
  op16Shinobu087,
  op16Yamato079,
  op17Izo003,
  op17Jozu008,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-087 Shinobu
 *   [On Play] You may trash this Character: Draw 1 card and up to 1 of your
 *   [Kouzuki Momonosuke] gains +20 cost during this turn.
 *
 * The parser kept only the draw and dropped the +20 cost clause entirely.
 * That clause is this deck's real enabler for OP16-084, whose ability is
 * gated on its own cost reaching 20.
 *
 * Proof pattern notes:
 *  - Both clauses are asserted separately, and the name filter is disproven
 *    against a non-Momonosuke Character on the same board.
 *  - Cost is projected, so the modifier is read straight off the view.
 */
describe("OP16-087 Shinobu", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [
          { card: op16KouzukiMomonosuke084, playedOnTurn: 0 },
          { card: op17Izo003, playedOnTurn: 0 },
        ],
        hand: [{ card: op16Shinobu087 }],
        deck: [op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  const costOf = (engine: OnePieceTestEngine, cardId: string) =>
    engine.getView("south").players.south.characters.find((card) => card?.cardId === cardId)?.cost;

  test("trashes itself to draw 1 and give [Kouzuki Momonosuke] +20 cost", () => {
    const engine = setup();
    const shinobuHandBefore = engine.getView("south").players.south.hand.length;
    expect(costOf(engine, op16KouzukiMomonosuke084.id)).toBe(5);

    engine.play(op16Shinobu087, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected the +20 cost prompt.");
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [target.candidates[0]!.ref.id] },
      "south",
    );

    const view = engine.getView("south");
    // Clause 1: Shinobu paid itself into the trash and a card was drawn.
    expect(view.players.south.trash.map((card) => card.cardId)).toContain(op16Shinobu087.id);
    expect(view.players.south.hand).toHaveLength(shinobuHandBefore);
    // Clause 2: printed cost 5 becomes 25.
    expect(costOf(engine, op16KouzukiMomonosuke084.id)).toBe(25);
    expect(view.prompts).toHaveLength(0);
  });

  test("a non-[Kouzuki Momonosuke] Character is not an eligible target", () => {
    const engine = setup();
    const izoId = engine.findCardInZone("south", "character", op17Izo003);
    const izoCostBefore = costOf(engine, op17Izo003.id);

    engine.play(op16Shinobu087, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected the +20 cost prompt.");

    expect(target.candidates.map((candidate) => candidate.ref.id)).not.toContain(izoId);
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [target.candidates[0]!.ref.id] },
      "south",
    );

    expect(costOf(engine, op17Izo003.id)).toBe(izoCostBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the +20 cost expires at the turn boundary", () => {
    const engine = setup();

    engine.play(op16Shinobu087, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected the +20 cost prompt.");
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [target.candidates[0]!.ref.id] },
      "south",
    );
    expect(costOf(engine, op16KouzukiMomonosuke084.id)).toBe(25);

    engine.endTurn("south");

    expect(costOf(engine, op16KouzukiMomonosuke084.id)).toBe(5);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("declining leaves Shinobu on the board and costs unchanged", () => {
    const engine = setup();

    engine.play(op16Shinobu087, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south");
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.cardId)).toContain(
      op16Shinobu087.id,
    );
    expect(costOf(engine, op16KouzukiMomonosuke084.id)).toBe(5);
    expect(view.prompts).toHaveLength(0);
  });
});
