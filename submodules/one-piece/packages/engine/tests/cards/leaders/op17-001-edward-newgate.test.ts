import { describe, expect, test } from "vite-plus/test";
import { op12EdwardNewgate002, op17EdwardNewgate001, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-001 Edward.Newgate (Leader)
 *   [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your
 *   hand: Up to 1 of your Leader or Characters gains +4000 power during this
 *   battle.
 *
 * Proof pattern notes:
 *  - Leader: 5000 power, 5 Life (mono-colored).
 *  - The trigger fires during the opponent's attack, so the boost is proven by
 *    battle outcome rather than by reading power after the battle resolves.
 */
describe("OP17-001 Edward.Newgate", () => {
  const setup = (hand: { card: typeof op17Jozu008 }[]) =>
    OnePieceTestEngine.create(
      { leaderCardId: op17EdwardNewgate001, hand, life: 3 },
      { character: [{ card: op12EdwardNewgate002, playedOnTurn: 0 }] },
      { firstPlayer: "south", activeSeat: "north" },
    );

  test("has 5000 power and 5 Life", () => {
    expect(op17EdwardNewgate001.power).toBe(5000);
    expect(op17EdwardNewgate001.life).toBe(5);
  });

  test("trashing a card grants +4000, repelling a 6000 attack", () => {
    const engine = setup([{ card: op17Jozu008 }]);
    const attackerId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    // Leader is 5000 against a 6000 attacker; only the +4000 saves it.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    // The single hand card auto-pays the trash cost, then the boost is aimed.
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [engine.leader("south")] },
      "south",
    );
    // Paying the trash cost emptied the hand, so the counter step auto-passes.

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    expect(view.players.south.trash.map((card) => card.cardId)).toContain(op17Jozu008.id);
    expect(view.prompts).toHaveLength(0);
  });

  test("declining leaves the Leader at 5000 and the attack connects", () => {
    // Built inline so the decline path names the Leader under test directly.
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17EdwardNewgate001,
        hand: [{ card: op17Jozu008 }],
        life: 3,
      },
      { character: [{ card: op12EdwardNewgate002, playedOnTurn: 0 }] },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const paymentId = engine.findCardInZone("south", "hand", op17Jozu008);
    const lifeBefore = engine.getView("south").players.south.lifeCount;
    const handBefore = engine.getView("south").players.south.hand.length;
    const activeDonBefore = engine.getView("south").players.south.activeDon;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");
    // The hand still holds a card, so a counter-step prompt appears even though
    // that card is not a legal Counter.
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "south");

    const view = engine.getView("south").players.south;
    // Nothing was trashed, no DON!! spent, and the attack went through.
    expect(view.hand.map((card) => card.instanceId)).toContain(paymentId);
    expect(view.trash.map((card) => card.instanceId)).not.toContain(paymentId);
    // The connecting attack moved a Life card into hand, so it grows by one.
    expect(view.hand).toHaveLength(handBefore + 1);
    expect(view.activeDon).toBe(activeDonBefore);
    expect(view.lifeCount).toBe(lifeBefore - 1);
  });

  test("offers nothing when the hand is empty and the cost cannot be paid", () => {
    const engine = setup([]);
    const attackerId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    engine.declareAttack(attackerId, engine.leader("south"), "north");

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore - 1);
    expect(view.prompts).toHaveLength(0);
  });
});
