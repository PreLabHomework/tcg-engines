import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import { op03Nami040, op16Kinemon082, op16Yamato079, op17Izo003, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-082 Kin'emon
 *   This Character gains +3 cost.
 *   [On Play] If your Leader has the {Land of Wano} type, look at 5 cards from
 *   the top of your deck; reveal up to 1 {Land of Wano} type card and add it
 *   to your hand. Then, trash the rest.
 *
 * Proof pattern notes:
 *  - Cost is projected for visible cards, so the permanent self-modifier is
 *    asserted directly on the view.
 *  - Remainder goes to the trash, so there is NO effectSearchRemainderOrder
 *    step; that prompt only appears for bottom-of-deck remainders.
 */
describe("OP16-082 Kin'emon", () => {
  const setup = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId,
        hand: [{ card: op16Kinemon082 }],
        // Top five: one eligible, four failing the {Land of Wano} filter.
        deck: [op17Jozu008, op17Izo003, op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("the permanent modifier puts its printed cost of 4 at 7 on the board", () => {
    const engine = setup(op16Yamato079);
    expect(op16Kinemon082.cost).toBe(4);

    engine.play(op16Kinemon082, "south");
    const search = engine.pendingDecision("effectSearchSelection", "south").steps[0];
    if (search?.kind !== "selectEntity") throw new Error("Expected Kin'emon's search.");
    engine.resolveDecision("effectSearchSelection", { selectedIds: [] }, "south");

    const kinemon = engine
      .getView("south")
      .players.south.characters.find((card) => card?.cardId === op16Kinemon082.id);
    expect(kinemon?.cost).toBe(7);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("looks at 5, offers only the {Land of Wano} card, and trashes the rest", () => {
    const engine = setup(op16Yamato079);
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.play(op16Kinemon082, "south");

    const search = engine.pendingDecision("effectSearchSelection", "south").steps[0];
    if (search?.kind !== "selectEntity") throw new Error("Expected Kin'emon's search.");
    expect(search.candidates).toHaveLength(5);

    const cardIdOf = (id: string) => engine.getState().cards[id]?.cardId;
    const legal = search.candidates
      .filter((candidate) => candidate.legal)
      .map((candidate) => cardIdOf(candidate.ref.id));
    // OP17-008 Jozu is {Whitebeard Pirates}; only Izo passes the trait filter.
    expect(legal).toEqual([op17Izo003.id]);

    const pickedId = search.candidates.find((candidate) => candidate.legal)!.ref.id;
    const remainder = search.candidates
      .map((candidate) => candidate.ref.id)
      .filter((id) => id !== pickedId);
    engine.resolveDecision("effectSearchSelection", { selectedIds: [pickedId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand.map((card) => card.instanceId)).toContain(pickedId);
    const trashIds = view.players.south.trash.map((card) => card.instanceId);
    for (const id of remainder) {
      expect(trashIds).toContain(id);
    }
    expect(view.players.south.deckCount).toBe(deckBefore - 5);
    expect(view.prompts).toHaveLength(0);
  });

  test("the search does nothing when the Leader lacks {Land of Wano}", () => {
    const engine = setup(op03Nami040);
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.play(op16Kinemon082, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand).toHaveLength(0);
    expect(view.players.south.trash).toHaveLength(0);
    expect(view.players.south.deckCount).toBe(deckBefore);
    // The permanent cost modifier is unconditional and still applies.
    const kinemon = view.players.south.characters.find(
      (card) => card?.cardId === op16Kinemon082.id,
    );
    expect(kinemon?.cost).toBe(7);
    expect(view.prompts).toHaveLength(0);
  });
});
