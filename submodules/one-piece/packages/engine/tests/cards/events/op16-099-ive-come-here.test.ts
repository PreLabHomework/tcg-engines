import { describe, expect, test } from "vite-plus/test";
import {
  op16IveComeHereToCutThoseChains099,
  op16Yamato079,
  op16Yamato096,
  op17Izo003,
  op17Jozu008,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-099 I've Come Here... To Cut Those Chains!!
 *   [Main] You may rest 6 of your DON!! cards: Trash 5 cards from the top of
 *   your deck. Then, play up to 1 {Land of Wano} type Character card with a
 *   cost of 6 or less from your trash.
 *   [Counter] Your Leader gains +3000 power during this battle.
 *
 * The two printed modes are proven independently.
 *
 * Proof pattern notes:
 *  - The DON!! cost is verified by asserting six cards actually moved from
 *    active to rested, not merely that the effect resolved.
 *  - OP17-003 Izo is {Land of Wano} cost 4 (eligible); OP16-096 Yamato is
 *    {Land of Wano} cost 8 and OP17-008 Jozu is cost 6 but {Whitebeard
 *    Pirates}, so each fails exactly one filter.
 */
describe("OP16-099 I've Come Here... To Cut Those Chains!!", () => {
  test("[Main] rests 6 DON!!, mills 5, and revives an eligible Character", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        hand: [{ card: op16IveComeHereToCutThoseChains099 }],
        trash: [{ card: op17Izo003 }, { card: op16Yamato096 }, { card: op17Jozu008 }],
        deck: [op17Jozu008, op17Jozu008, op17Jozu008, op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const before = engine.getView("south").players.south;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;
    const activeBefore = before.activeDon;

    engine.play(op16IveComeHereToCutThoseChains099, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const pick = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (pick?.kind !== "selectEntity") throw new Error("Expected the revive prompt.");
    const eligible = pick.candidates.map(
      (candidate) => engine.getState().cards[candidate.ref.id]?.cardId,
    );
    expect(eligible).toContain(op17Izo003.id);
    // Cost 8 fails the cost filter.
    expect(eligible).not.toContain(op16Yamato096.id);
    // {Whitebeard Pirates} fails the trait filter.
    expect(eligible).not.toContain(op17Jozu008.id);
    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [pick.candidates.find((c) => c.legal)!.ref.id] },
      "south",
    );

    const view = engine.getView("south");
    // Cost actually paid: the event's own 1 DON!! plus the 6 rested for it.
    expect(view.players.south.restedDon).toBeGreaterThanOrEqual(6);
    expect(view.players.south.activeDon).toBe(activeBefore - 7);
    // Five cards milled off the deck.
    expect(view.players.south.deckCount).toBe(deckBefore - 5);
    // Trash grew by the five milled plus the event, less the revived Izo.
    expect(view.players.south.trash.length).toBe(trashBefore + 5);
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.cardId)).toContain(
      op17Izo003.id,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("[Main] declining rests no DON!! and mills nothing", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        hand: [{ card: op16IveComeHereToCutThoseChains099 }],
        trash: [{ card: op17Izo003 }],
        deck: [op17Jozu008, op17Jozu008, op17Jozu008, op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.play(op16IveComeHereToCutThoseChains099, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south");
    expect(view.players.south.deckCount).toBe(deckBefore);
    // Only the event's own cost was rested, not the additional six.
    expect(view.players.south.restedDon).toBeLessThan(6);
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(0);
    expect(view.prompts).toHaveLength(0);
  });

  test("[Counter] gives the Leader +3000 and changes the battle outcome", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        hand: [{ card: op16IveComeHereToCutThoseChains099 }],
        // The Counter event still costs 1 DON!! to activate from hand.
        activeDon: 2,
        life: 3,
      },
      { character: [{ card: op17Izo003, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op17Izo003);
    const counterId = engine.findCardInZone("south", "hand", op16IveComeHereToCutThoseChains099);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    // OP17-003 Izo is 6000 against the 5000 Leader; +3000 reaches 8000.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleCounter", { selectedIds: [counterId] }, "south");

    const view = engine.getView("south");
    // The attack failed, so no Life was lost.
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    // The Counter card left hand for the trash.
    expect(view.players.south.hand).toHaveLength(0);
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(counterId);
    expect(view.prompts).toHaveLength(0);
  });
});
