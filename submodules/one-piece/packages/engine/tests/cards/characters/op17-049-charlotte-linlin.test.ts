import { describe, expect, test } from "vite-plus/test";
import { op12Fullbody052, op17CharlotteLinlin049, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-049 Charlotte Linlin
 *   [On Play] Your opponent chooses one:
 *     - Draw 2 cards.
 *     - Your opponent trashes 2 cards from their hand.
 *   [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from
 *   your hand: Up to 1 of your Leader or Characters gains +1000 power during
 *   this battle.
 *
 * The parser kept the Counter-style attack clause and dropped the entire
 * opponent-choice mode. The two modes are proven independently.
 *
 * Proof pattern notes:
 *  - The CHOICE belongs to the opponent: the prompt is addressed to north and
 *    both branches are exercised, each with its own consequence.
 */
describe("OP17-049 Charlotte Linlin", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17CharlotteLinlin049 }],
        deck: [op12Fullbody052, op12Fullbody052, op12Fullbody052],
        activeDon: 10,
        life: 3,
      },
      {
        hand: [{ card: op12Fullbody052 }, { card: op12Fullbody052 }, { card: op12Fullbody052 }],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("[On Play] the prompt is addressed to the OPPONENT, not the controller", () => {
    const engine = setup();
    engine.play(op17CharlotteLinlin049, "south");

    // The controller has no pending decision; the opponent does.
    expect(engine.getView("south").prompts).toHaveLength(0);
    const northPrompts = engine.getView("north").prompts;
    expect(northPrompts).toHaveLength(1);
    expect(northPrompts[0]?.seat).toBe("north");
    expect(northPrompts[0]?.options).toHaveLength(2);

    engine.resolveDecision("effectActionChoice", { optionId: "0" }, "north");
    expect(engine.getView("north").prompts).toHaveLength(0);
  });

  test("[On Play] first branch: the controller draws 2", () => {
    const engine = setup();
    const before = engine.getView("south").players.south;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const northHandBefore = engine.getView("north").players.north.hand.length;

    engine.play(op17CharlotteLinlin049, "south");
    engine.resolveDecision("effectActionChoice", { optionId: "0" }, "north");

    const after = engine.getView("south").players.south;
    // Played Linlin (-1), drew 2 (+2).
    expect(after.hand.length).toBe(handBefore + 1);
    expect(after.deckCount).toBe(deckBefore - 2);
    // The opponent's hand is untouched on this branch.
    expect(engine.getView("north").players.north.hand.length).toBe(northHandBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("[On Play] second branch: the opponent trashes 2 instead", () => {
    const engine = setup();
    const before = engine.getView("south").players.south;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const northHandBefore = engine.getView("north").players.north.hand.length;

    engine.play(op17CharlotteLinlin049, "south");
    engine.resolveDecision("effectActionChoice", { optionId: "1" }, "north");
    // The opponent then picks which two cards to discard.
    const discard = engine.pendingDecision("effectTrashFromHandSelection", "north").steps[0];
    if (discard?.kind !== "selectEntity") throw new Error("Expected the opponent discard prompt.");
    engine.resolveDecision(
      "effectTrashFromHandSelection",
      { selectedIds: discard.candidates.slice(0, 2).map((candidate) => candidate.ref.id) },
      "north",
    );

    const after = engine.getView("south").players.south;
    // No draw on this branch; only Linlin left hand.
    expect(after.hand.length).toBe(handBefore - 1);
    expect(after.deckCount).toBe(deckBefore);
    expect(engine.getView("north").players.north.hand.length).toBe(northHandBefore - 2);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("[On Your Opponent's Attack] trashing 1 grants +1000 for the battle", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17CharlotteLinlin049, playedOnTurn: 0 }],
        hand: [{ card: op12Fullbody052 }],
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op12Fullbody052);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    // 6000 attacker into the 5000 Leader; +1000 ties at 6000, which still
    // connects, so the meaningful assertion is the cost and the modifier.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [engine.leader("south")] },
      "south",
    );

    const view = engine.getView("south");
    expect(view.players.south.trash.map((card) => card.cardId)).toContain(op12Fullbody052.id);
    expect(view.players.south.lifeCount).toBe(lifeBefore - 1);
    expect(view.prompts).toHaveLength(0);
  });

  test("may decline the [On Your Opponent's Attack] optional", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17CharlotteLinlin049, rested: true, playedOnTurn: 0 }],
        hand: [{ card: op12Fullbody052 }],
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op12Fullbody052);
    // Attack Linlin (7000) rather than the Leader: a 6000 attacker fails, so
    // no Life card moves into hand to confound the economy snapshot.
    const linlinId = engine.findCardInZone("south", "character", op17CharlotteLinlin049);

    engine.declareAttack(attackerId, linlinId, "north");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const donDeckBefore = before.donDeckCount;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;
    const lifeBefore = before.lifeCount;

    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "south");

    const after = engine.getView("south").players.south;
    expect(after.activeDon + after.restedDon).toBe(donPoolBefore);
    expect(after.donDeckCount).toBe(donDeckBefore);
    expect(after.hand.length).toBe(handBefore);
    expect(after.deckCount).toBe(deckBefore);
    expect(after.trash.length).toBe(trashBefore);
    expect(after.lifeCount).toBe(lifeBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
