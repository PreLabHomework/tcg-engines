import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import { op03Nami040, op16Nami091, op16Yamato079, op17Izo003, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-091 Nami
 *   [On Play] If your Leader has the {Land of Wano} type, look at 4 cards from
 *   the top of your deck; reveal up to 1 {Land of Wano} type card other than
 *   [Nami] and add it to your hand. Then, trash the rest.
 *
 * Proof pattern notes:
 *  - Search resolves in ONE step when the remainder goes to the trash. The
 *    effectSearchRemainderOrder prompt only appears for bottom-of-deck
 *    remainders, where the order is player-chosen.
 *  - Two disqualified cards sit in the looked-at window: OP17-008 Jozu fails
 *    the trait filter, and a second copy of Nami fails the name exclusion.
 */
describe("OP16-091 Nami", () => {
  const setup = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId,
        hand: [{ card: op16Nami091 }],
        // Top four: eligible, wrong trait, excluded by name, wrong trait.
        deck: [op17Izo003, op17Jozu008, op16Nami091, op17Jozu008],
        activeDon: 4,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("looks at 4 and offers only the eligible {Land of Wano} non-Nami card", () => {
    const engine = setup(op16Yamato079);
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.play(op16Nami091, "south");

    const search = engine.pendingDecision("effectSearchSelection", "south").steps[0];
    if (search?.kind !== "selectEntity") throw new Error("Expected Nami's search.");
    expect(search.candidates).toHaveLength(4);

    const cardIdOf = (id: string) => engine.getState().cards[id]?.cardId;
    const legal = search.candidates
      .filter((candidate) => candidate.legal)
      .map((candidate) => cardIdOf(candidate.ref.id));
    // Only OP17-003 Izo satisfies both the trait filter and the name exclusion.
    expect(legal).toEqual([op17Izo003.id]);
    expect(legal).not.toContain(op17Jozu008.id);
    expect(legal).not.toContain(op16Nami091.id);

    const pickedId = search.candidates.find((candidate) => candidate.legal)!.ref.id;
    engine.resolveDecision("effectSearchSelection", { selectedIds: [pickedId] }, "south");
    const remainder = search.candidates
      .map((candidate) => candidate.ref.id)
      .filter((id) => id !== pickedId);
    // No remainder-order step: trash order is meaningless, so unlike a
    // bottom-of-deck remainder this resolves without a second prompt.

    const view = engine.getView("south");
    expect(view.players.south.hand.map((card) => card.instanceId)).toContain(pickedId);
    // The remainder is trashed rather than returned to the deck.
    const trashIds = view.players.south.trash.map((card) => card.instanceId);
    for (const id of remainder) {
      expect(trashIds).toContain(id);
    }
    expect(view.players.south.deckCount).toBe(deckBefore - 4);
    expect(view.prompts).toHaveLength(0);
  });

  test("does nothing when the Leader lacks {Land of Wano}", () => {
    const engine = setup(op03Nami040);
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.play(op16Nami091, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand).toHaveLength(0);
    expect(view.players.south.trash).toHaveLength(0);
    expect(view.players.south.deckCount).toBe(deckBefore);
    expect(view.prompts).toHaveLength(0);
  });
});
