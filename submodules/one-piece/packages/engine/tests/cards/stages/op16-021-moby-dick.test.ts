import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import { op02EdwardNewgate001, op03Nami040, op16MobyDick021, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-021 Moby Dick (Stage)
 *   [On Play] If your Leader has the {Whitebeard Pirates} type, look at 3 cards
 *   from the top of your deck and add up to 1 card to your hand. Then, place
 *   the rest at the bottom of your deck in any order.
 *   [Activate: Main] You may trash this Stage: Give up to 1 rested DON!! card
 *   to your Leader or 1 of your Characters.
 *
 * Proof pattern notes:
 *  - Stage cards occupy their own zone; trashThisCard removes them from it.
 *  - The On Play search has no reveal filter, so every looked-at card is legal.
 */
describe("OP16-021 Moby Dick", () => {
  const setup = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId,
        hand: [{ card: op16MobyDick021 }],
        deck: [op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 2,
        life: 3,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("with a {Whitebeard Pirates} Leader, looks at 3 and adds 1 to hand", () => {
    const engine = setup(op02EdwardNewgate001);

    engine.play(op16MobyDick021, "south");

    const search = engine.pendingDecision("effectSearchSelection", "south").steps[0];
    if (search?.kind !== "selectEntity") throw new Error("Expected Moby Dick's search.");
    // No reveal filter on this card, so all three looked-at cards are legal.
    expect(search.candidates).toHaveLength(3);
    expect(search.candidates.filter((candidate) => candidate.legal)).toHaveLength(3);
    const pickedId = search.candidates[0]?.ref.id;
    if (!pickedId) throw new Error("Expected a candidate.");
    engine.resolveDecision("effectSearchSelection", { selectedIds: [pickedId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand.map((card) => card.instanceId)).toContain(pickedId);
    expect(view.players.south.stage?.cardId).toBe(op16MobyDick021.id);
  });

  test("does nothing on play when the Leader lacks {Whitebeard Pirates}", () => {
    const engine = setup(op03Nami040);

    engine.play(op16MobyDick021, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand).toHaveLength(0);
    expect(view.players.south.stage?.cardId).toBe(op16MobyDick021.id);
    expect(view.prompts).toHaveLength(0);
  });
});
