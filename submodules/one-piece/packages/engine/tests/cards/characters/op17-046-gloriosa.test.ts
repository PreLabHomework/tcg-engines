import { describe, expect, test } from "vite-plus/test";
import { op16Nami091, op17Gloriosa046, op17Jozu008, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-046 Gloriosa
 *   [Blocker]
 *   [On Play] Place up to 1 Character with a cost of 5 or less at the bottom
 *   of the owner's deck.
 *
 * Proof pattern notes (same standard as OP17-041 Wang Zhi):
 *  - "The card left the board" is NOT sufficient. The destination is proven
 *    by deck count, by hand and trash staying flat, and by the owner's next
 *    draw NOT being the returned card, which rules out the top of the deck.
 *  - The target has no side restriction, so a Character of EITHER player is
 *    legal and must go to its OWNER's deck. Both directions are asserted.
 *  - OP16-091 Nami is cost 1 (eligible); OP17-008 Jozu is cost 6 (not).
 */
describe("OP17-046 Gloriosa", () => {
  test("bottom-decks an opponent's Character into THAT player's deck", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17Gloriosa046 }],
        activeDon: 10,
        life: 3,
      },
      {
        character: [{ card: op16Nami091, playedOnTurn: 0 }],
        // Known top of deck, so the next draw is identifiable.
        deck: [op17Jozu008, op17Jozu008, op17Jozu008],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const namiId = engine.findCardInZone("north", "character", op16Nami091);
    const north = engine.getView("north").players.north;
    const northDeckBefore = north.deckCount;
    const northHandBefore = north.hand.length;
    const northTrashBefore = north.trash.length;
    const southDeckBefore = engine.getView("south").players.south.deckCount;

    engine.play(op17Gloriosa046, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [namiId] }, "south");

    const after = engine.getView("north").players.north;
    expect(after.characters.filter(Boolean)).toHaveLength(0);
    // It went to its OWNER's deck, not the controller's, and not hand/trash.
    expect(after.deckCount).toBe(northDeckBefore + 1);
    expect(after.hand.length).toBe(northHandBefore);
    expect(after.trash.length).toBe(northTrashBefore);
    expect(engine.getView("south").players.south.deckCount).toBe(southDeckBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);

    // The BOTTOM, not the top: the owner's next draw is the known top card.
    engine.endTurn();
    const drawn = engine.getView("north").players.north.hand.map((card) => card.cardId);
    expect(drawn).not.toContain(op16Nami091.id);
    expect(drawn).toContain(op17Jozu008.id);
  });

  test("bottom-decks your OWN Character into your own deck", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op16Nami091, playedOnTurn: 0 }],
        hand: [{ card: op17Gloriosa046 }],
        deck: [op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { deck: [op17Jozu008, op17Jozu008], life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const namiId = engine.findCardInZone("south", "character", op16Nami091);
    const southDeckBefore = engine.getView("south").players.south.deckCount;
    const northDeckBefore = engine.getView("north").players.north.deckCount;

    engine.play(op17Gloriosa046, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [namiId] }, "south");

    const south = engine.getView("south").players.south;
    // Only Gloriosa remains on south's board; Nami went home.
    expect(south.characters.filter(Boolean).map((card) => card?.cardId)).toEqual([
      op17Gloriosa046.id,
    ]);
    expect(south.deckCount).toBe(southDeckBefore + 1);
    expect(engine.getView("north").players.north.deckCount).toBe(northDeckBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("a Character above cost 5 is not an eligible target", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17Gloriosa046 }],
        activeDon: 10,
        life: 3,
      },
      {
        character: [
          { card: op16Nami091, playedOnTurn: 0 },
          { card: op17Jozu008, playedOnTurn: 0 },
        ],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const jozuId = engine.findCardInZone("north", "character", op17Jozu008);
    const namiId = engine.findCardInZone("north", "character", op16Nami091);

    engine.play(op17Gloriosa046, "south");

    const step = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (step?.kind !== "selectEntity") throw new Error("Expected Gloriosa's target prompt.");
    const candidateIds = step.candidates.map((candidate) => candidate.ref.id);
    expect(candidateIds).toContain(namiId);
    expect(candidateIds).not.toContain(jozuId);

    engine.resolveDecision("effectTargetSelection", { selectedIds: [] }, "south");
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("[Blocker] redirects an attack away from the Leader", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17Gloriosa046, playedOnTurn: 0 }],
        life: 3,
      },
      { character: [{ card: op17Jozu008, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const blockerId = engine.findCardInZone("south", "character", op17Gloriosa046);
    const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleBlocker", { selectedIds: [blockerId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    // Gloriosa is 1000 against an 8000 attacker: blocked, then K.O.'d.
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(blockerId);
    expect(view.prompts).toHaveLength(0);
  });
});
