import { describe, expect, test } from "vite-plus/test";
import {
  op12Fullbody052,
  op16Nami091,
  op17Jozu008,
  op17Kyo045,
  op17RocksDXebec039,
  op17WangZhi041,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-045 Kyo
 *   If one of your Characters would be removed from the field by your
 *   opponent's effect, you may trash 2 cards from your hand instead.
 *   [On Play] Draw 1 card.
 *
 * The parser kept only the draw and dropped the replacement clause. The
 * semantic audit missed it too: this and OP17-041 Wang Zhi were both false
 * negatives, which is why the audit now carries a replacement-effect rule.
 *
 * Proof pattern notes:
 *  - The replacement is driven by a real opponent effect. OP17-041 Wang Zhi
 *    bottom-decks every cost-1 opponent Character, so a cost-1 Kyo target is
 *    the removal source.
 *  - "Instead" means the Character STAYS. Proving the trash alone is not
 *    enough; the board must be unchanged too.
 */
describe("OP17-045 Kyo", () => {
  test("[On Play] draws 1", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17Kyo045 }],
        deck: [op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const before = engine.getView("south").players.south;

    engine.play(op17Kyo045, "south");

    const after = engine.getView("south").players.south;
    expect(after.hand.length).toBe(before.hand.length);
    expect(after.deckCount).toBe(before.deckCount - 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  /**
   * North plays Wang Zhi, whose [On Play] bottom-decks every cost-1 Character
   * the opponent controls. South's cost-1 Character is the removal target.
   */
  const removalSetup = (southHand: { card: typeof op17Jozu008 }[]) =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        // Kyo provides the replacement; the cost-1 Nami is what Wang Zhi
        // actually tries to remove (Kyo itself is cost 2 and not a target).
        character: [
          { card: op17Kyo045, playedOnTurn: 0 },
          { card: op16Nami091, playedOnTurn: 0 },
        ],
        hand: southHand,
        deck: [op17Jozu008, op17Jozu008],
        life: 3,
      },
      {
        hand: [{ card: op17WangZhi041 }, { card: op17Jozu008 }],
        activeDon: 10,
        life: 3,
      },
      { firstPlayer: "north", activeSeat: "north" },
    );

  test("Kyo itself is not cost 1, so it is not the removal target here", () => {
    // Guard against a vacuous setup: OP17-045 is cost 2.
    expect(op17Kyo045.cost).toBe(2);
  });

  test("trashing 2 from hand keeps the Character on the field instead", () => {
    const engine = removalSetup([
      { card: op12Fullbody052 },
      { card: op12Fullbody052 },
      { card: op12Fullbody052 },
    ]);
    const southBoardBefore = engine
      .getView("south")
      .players.south.characters.filter(Boolean).length;
    const southHandBefore = engine.getView("south").players.south.hand.length;
    const southTrashBefore = engine.getView("south").players.south.trash.length;

    engine.play(op17WangZhi041, "north");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "north");
    // The replacement is offered to the CONTROLLER of the threatened card.
    engine.resolveDecision("effectRemovalReplacement", { optionId: "yes" }, "south");
    // Paying the substitute cost needs its own card selection.
    const discard = engine.pendingDecision("effectTrashFromHandSelection", "south").steps[0];
    if (discard?.kind !== "selectEntity") throw new Error("Expected the discard prompt.");
    engine.resolveDecision(
      "effectTrashFromHandSelection",
      { selectedIds: discard.candidates.slice(0, 2).map((candidate) => candidate.ref.id) },
      "south",
    );

    const view = engine.getView("south");
    // Nothing on south's board moved: the replacement was applied instead,
    // so the cost-1 Nami is still there rather than bottom-decked.
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(southBoardBefore);
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.cardId)).toContain(
      op16Nami091.id,
    );
    // Two cards paid out of hand into the trash.
    expect(view.players.south.hand.length).toBe(southHandBefore - 2);
    expect(view.players.south.trash.length).toBe(southTrashBefore + 2);
    expect(view.prompts).toHaveLength(0);
    expect(engine.getView("north").prompts).toHaveLength(0);
  });

  test("declining the replacement lets the removal happen normally", () => {
    const engine = removalSetup([
      { card: op12Fullbody052 },
      { card: op12Fullbody052 },
      { card: op12Fullbody052 },
    ]);
    const southHandBefore = engine.getView("south").players.south.hand.length;
    const southDeckBefore = engine.getView("south").players.south.deckCount;

    engine.play(op17WangZhi041, "north");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "north");
    engine.resolveDecision("effectRemovalReplacement", { optionId: "no" }, "south");

    const view = engine.getView("south");
    // Nothing paid from hand, and the cost-1 Character really left the board.
    expect(view.players.south.hand.length).toBe(southHandBefore);
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.cardId)).not.toContain(
      op16Nami091.id,
    );
    expect(view.players.south.deckCount).toBe(southDeckBefore + 1);
    expect(view.prompts).toHaveLength(0);
  });
});
