import { describe, expect, test } from "vite-plus/test";
import {
  op16Nami091,
  op16NicoRobin092,
  op17Jozu008,
  op17RocksDXebec039,
  op17WangZhi041,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-041 Wang Zhi
 *   [Blocker]
 *   [On Play] You may trash 1 card from your hand: Place all of your
 *   opponent's Characters with a base cost of 1 at the bottom of the owner's
 *   deck in any order of the owner's choosing.
 *
 * The parser emitted only the [Blocker] keyword and dropped the entire
 * [On Play]. The semantic audit did not flag it either, because no rule
 * covered "place at the bottom of the owner's deck" — the first false
 * negative from that tooling.
 *
 * Proof pattern notes:
 *  - "card left the board" is NOT sufficient: returnToHand, a trash, or a
 *    top-of-deck placement would all look similar. The destination is proven
 *    by deck count, by hand/trash staying flat, and by the opponent's next
 *    draw NOT being the returned card (which rules out the top).
 *  - OP16-091 Nami and OP16-092 Nico Robin are cost 1; OP17-008 Jozu is 6.
 */
describe("OP17-041 Wang Zhi", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17WangZhi041 }, { card: op17Jozu008 }],
        activeDon: 10,
        life: 3,
      },
      {
        character: [
          { card: op16Nami091, playedOnTurn: 0 },
          { card: op16NicoRobin092, playedOnTurn: 0 },
          { card: op17Jozu008, playedOnTurn: 0 },
        ],
        // A known, distinct top of deck so a later draw is identifiable.
        deck: [op17Jozu008, op17Jozu008, op17Jozu008],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("[On Play] bottom-decks every cost-1 opponent Character and spares the rest", () => {
    const engine = setup();
    const namiId = engine.findCardInZone("north", "character", op16Nami091);
    const robinId = engine.findCardInZone("north", "character", op16NicoRobin092);
    const before = engine.getView("north").players.north;
    const deckBefore = before.deckCount;
    const northHandBefore = before.hand.length;
    const northTrashBefore = before.trash.length;
    const southTrashBefore = engine.getView("south").players.south.trash.length;

    engine.play(op17WangZhi041, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    // "in any order of the OWNER's choosing": the ordering prompt belongs to
    // the opponent, not the controller.
    expect(engine.pendingDecision("effectReturnToDeckOwnerOrder", "north").steps[0]?.kind).toBe(
      "orderItems",
    );
    engine.resolveDecision(
      "effectReturnToDeckOwnerOrder",
      { selectedIds: [namiId, robinId] },
      "north",
    );

    const north = engine.getView("north").players.north;
    // Both cost-1 Characters left; the cost-6 Jozu stayed.
    const remaining = north.characters.filter(Boolean).map((card) => card?.cardId);
    expect(remaining).toEqual([op17Jozu008.id]);
    // They went to the DECK, not the hand and not the trash.
    expect(north.deckCount).toBe(deckBefore + 2);
    expect(north.hand.length).toBe(northHandBefore);
    expect(north.trash.length).toBe(northTrashBefore);
    // The cost was paid from the controller's hand, not the opponent's.
    expect(engine.getView("south").players.south.trash.length).toBe(southTrashBefore + 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("they land at the BOTTOM: the opponent's next draw is not one of them", () => {
    const engine = setup();
    const namiId = engine.findCardInZone("north", "character", op16Nami091);
    const robinId = engine.findCardInZone("north", "character", op16NicoRobin092);

    engine.play(op17WangZhi041, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    expect(engine.pendingDecision("effectReturnToDeckOwnerOrder", "north").steps[0]?.kind).toBe(
      "orderItems",
    );
    engine.resolveDecision(
      "effectReturnToDeckOwnerOrder",
      { selectedIds: [namiId, robinId] },
      "north",
    );

    // Hand the turn over so the opponent draws from the top of its deck.
    engine.endTurn("south");

    const northHand = engine.getView("north").players.north.hand.map((card) => card.cardId);
    // Had the placement been on top, one of these would have been drawn.
    expect(northHand).not.toContain(op16Nami091.id);
    expect(northHand).not.toContain(op16NicoRobin092.id);
    expect(northHand).toContain(op17Jozu008.id);
    expect(engine.getView("north").prompts).toHaveLength(0);
  });

  test("[Blocker] redirects an attack away from the Leader", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17WangZhi041, playedOnTurn: 0 }],
        life: 3,
      },
      { character: [{ card: op17Jozu008, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const blockerId = engine.findCardInZone("south", "character", op17WangZhi041);
    const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleBlocker", { selectedIds: [blockerId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    // Wang Zhi is 6000 against an 8000 attacker, so it blocked and died.
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(blockerId);
    expect(view.prompts).toHaveLength(0);
  });

  test("may decline the optional, leaving both boards untouched", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17WangZhi041 }, { card: op17Jozu008 }],
        activeDon: 10,
        life: 3,
      },
      { character: [{ card: op16Nami091, playedOnTurn: 0 }], deck: [op17Jozu008], life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op17WangZhi041, "south");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const donDeckBefore = before.donDeckCount;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;
    const northDeckBefore = engine.getView("north").players.north.deckCount;

    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    expect(after.activeDon + after.restedDon).toBe(donPoolBefore);
    expect(after.donDeckCount).toBe(donDeckBefore);
    expect(after.hand.length).toBe(handBefore);
    expect(after.deckCount).toBe(deckBefore);
    expect(after.trash.length).toBe(trashBefore);
    // The opponent's cost-1 Character is still on the field.
    expect(engine.getView("north").players.north.deckCount).toBe(northDeckBefore);
    expect(
      engine
        .getView("north")
        .players.north.characters.filter(Boolean)
        .map((c) => c?.cardId),
    ).toContain(op16Nami091.id);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
