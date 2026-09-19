import { describe, expect, test } from "vite-plus/test";
import {
  op02EdwardNewgate001,
  op12Fullbody052,
  op17Haruta009,
  op17IDontHaveTimeToChat019,
  op17Jozu008,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-019 I Don't Have Time to Chat with Snot-Nosed Brats
 *   [Main] Look at 5 cards from the top of your deck; reveal up to 1 card with
 *   a type including "Whitebeard Pirates" and add it to your hand. Then, place
 *   the rest at the bottom of your deck in any order.
 *   [Trigger] Your Leader gains +1000 power during this turn.
 *
 * Proof pattern notes:
 *  - Deck search uses effectSearchSelection, then effectSearchRemainderOrder.
 *  - OP12-052 Fullbody is not {Whitebeard Pirates} and must be excluded.
 */
describe("OP17-019 I Don't Have Time to Chat with Snot-Nosed Brats", () => {
  test("reveals only a Whitebeard Pirates card and adds it to hand", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op02EdwardNewgate001,
        hand: [{ card: op17IDontHaveTimeToChat019 }],
        deck: [op12Fullbody052, op17Jozu008, op12Fullbody052, op12Fullbody052, op12Fullbody052],
        activeDon: 1,
        life: 3,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );
    const jozuId = engine.findCardInZone("south", "deck", op17Jozu008);

    engine.play(op17IDontHaveTimeToChat019, "south");

    const search = engine.pendingDecision("effectSearchSelection", "south").steps[0];
    if (search?.kind !== "selectEntity") throw new Error("Expected the search prompt.");
    // All five looked-at cards appear; only Jozu carries {Whitebeard Pirates},
    // so only Jozu is a legal reveal.
    expect(search.candidates).toHaveLength(5);
    const legalIds = search.candidates
      .filter((candidate) => candidate.legal)
      .map((candidate) => candidate.ref.id);
    expect(legalIds).toEqual([jozuId]);
    engine.resolveDecision("effectSearchSelection", { selectedIds: [jozuId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand.map((card) => card.instanceId)).toContain(jozuId);
  });

  test("finds nothing when no Whitebeard Pirates card is among the top 5", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op02EdwardNewgate001,
        hand: [{ card: op17IDontHaveTimeToChat019 }],
        deck: [
          op12Fullbody052,
          op12Fullbody052,
          op12Fullbody052,
          op12Fullbody052,
          op12Fullbody052,
          op17Haruta009,
        ],
        activeDon: 1,
        life: 3,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op17IDontHaveTimeToChat019, "south");

    const search = engine.pendingDecision("effectSearchSelection", "south").steps[0];
    if (search?.kind !== "selectEntity") throw new Error("Expected the search prompt.");
    // Haruta is the 6th card and therefore out of range, so nothing is legal.
    expect(search.candidates).toHaveLength(5);
    expect(search.candidates.filter((candidate) => candidate.legal)).toHaveLength(0);
  });
});
