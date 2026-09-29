import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import {
  op12EdwardNewgate002,
  op12Fullbody052,
  op17Jozu008,
  op17RocksDXebec039,
  op17Shiki048,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";
import { registerCards } from "../../../../cards/src/runtime-catalog.ts";

/**
 * OP17-048 Shiki
 *   [Rush: Character]
 *   [When Attacking]/[On Your Opponent's Attack] [Once Per Turn] You may trash
 *   1 card with a type including "Rocks Pirates" from your hand: Give up to 1
 *   of your opponent's Characters -3000 power during this turn.
 *
 * One printed [Once Per Turn] ability under two triggers, so both branches
 * share an oncePerTurnKey. The two triggers fire on opposite players' turns,
 * so the behavioral proof of the shared key is that it works on your attack
 * and then again when you are attacked on the following turn: the lock resets
 * at the turn boundary. No legal sequence fires the same branch twice in one
 * turn, so none is manufactured.
 */
const fodder = (suffix: string, name: string): CharacterCard => ({
  ...op12Fullbody052,
  id: `TEST-S48-${suffix}`,
  canonicalId: `TEST-S48-${suffix}`,
  slug: `test-s48-${suffix.toLowerCase()}`,
  name,
  cost: 1,
  traits: ["Rocks Pirates"],
  effects: undefined,
});
const F1 = fodder("F1", "Shiki Fodder One");
const F2 = fodder("F2", "Shiki Fodder Two");
registerCards([F1, F2]);

describe("OP17-048 Shiki", () => {
  test("carries [Rush: Character]", () => {
    expect(op17Shiki048.effects?.keywords).toContain("rushCharacter");
  });

  test("[When Attacking] trashing a Rocks Pirates card weakens an opponent Character", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17Shiki048, playedOnTurn: 0 }],
        hand: [{ card: F1 }],
        activeDon: 10,
        life: 3,
      },
      {
        character: [
          { card: op12EdwardNewgate002, rested: true, playedOnTurn: 0 },
          { card: op12Fullbody052, playedOnTurn: 0 },
        ],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const shikiId = engine.findCardInZone("south", "character", op17Shiki048);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const trashBefore = engine.getView("south").players.south.trash.length;

    engine.declareAttack(shikiId, victimId, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [victimId] }, "south");

    // The cost was paid from hand.
    expect(engine.getView("south").players.south.trash.length).toBe(trashBefore + 1);
    // 6000 debuffed to 3000, then destroyed by the 9000 attacker.
    expect(engine.getView("south").players.north.characters.filter(Boolean)).toHaveLength(1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the shared once-per-turn lock resets at the turn boundary", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17Shiki048, playedOnTurn: 0 }],
        hand: [{ card: F1 }, { card: F2 }],
        activeDon: 10,
        life: 3,
      },
      {
        // A second Character that is never attacked, so a legal debuff target
        // still exists on the opponent's turn. Without it, "no optional
        // offered" could mean no target rather than a lock that failed to reset.
        character: [
          { card: op12EdwardNewgate002, rested: true, playedOnTurn: 0 },
          { card: op12Fullbody052, playedOnTurn: 0 },
        ],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const shikiId = engine.findCardInZone("south", "character", op17Shiki048);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    // Your turn: the [When Attacking] branch.
    engine.declareAttack(shikiId, victimId, "south");
    // Two eligible cards in hand, so the trash cost needs an explicit pick.
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const pay = engine.pendingDecision("effectCostTrashFromHand", "south").steps[0];
    if (!pay || !("candidates" in pay)) throw new Error("Expected the trash-cost prompt.");
    engine.resolveDecision(
      "effectCostTrashFromHand",
      { selectedIds: [pay.candidates[0]!.ref.id] },
      "south",
    );
    // The debuff target is a separate step even with a single candidate, and
    // the battle stays open until it resolves.
    engine.resolveDecision("effectTargetSelection", { selectedIds: [victimId] }, "south");
    const trashAfterFirst = engine.getView("south").players.south.trash.length;
    expect(trashAfterFirst).toBeGreaterThan(0);

    // Opponent's turn: the [On Your Opponent's Attack] branch must be
    // available again, proving the shared key reset.
    expect(engine.getState().activeSeat).toBe("south");
    engine.endTurn();
    expect(engine.getState().activeSeat).toBe("north");
    engine.declareAttack(engine.leader("north"), engine.leader("south"), "north");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    // As on the first trigger, the debuff target is its own step. The
    // never-attacked Fullbody is the only legal target left.
    const survivorId = engine.findCardInZone("north", "character", op12Fullbody052);
    engine.resolveDecision("effectTargetSelection", { selectedIds: [survivorId] }, "south");
    // No counter step: both Rocks Pirates cards are now spent, so south's hand
    // is empty and the counter step auto-passes.

    // A second card left hand for the trash, so the branch really fired.
    expect(engine.getView("south").players.south.trash.length).toBe(trashAfterFirst + 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("with no Rocks Pirates card in hand the cost cannot be paid", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17Shiki048, playedOnTurn: 0 }],
        // OP17-008 Jozu is Whitebeard Pirates, not Rocks Pirates.
        hand: [{ card: op17Jozu008 }],
        activeDon: 10,
        life: 3,
      },
      {
        character: [{ card: op12EdwardNewgate002, rested: true, playedOnTurn: 0 }],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const shikiId = engine.findCardInZone("south", "character", op17Shiki048);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const trashBefore = engine.getView("south").players.south.trash.length;

    engine.declareAttack(shikiId, victimId, "south");

    // No optional offered, so the 6000 Character was never debuffed.
    expect(engine.getView("south").players.south.trash.length).toBe(trashBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("may decline the [When Attacking] optional", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17Shiki048, playedOnTurn: 0 }],
        hand: [{ card: F1 }],
        activeDon: 10,
        life: 3,
      },
      {
        character: [{ card: op12EdwardNewgate002, rested: true, playedOnTurn: 0 }],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const shikiId = engine.findCardInZone("south", "character", op17Shiki048);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.declareAttack(shikiId, victimId, "south");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const donDeckBefore = before.donDeckCount;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;

    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    expect(after.activeDon + after.restedDon).toBe(donPoolBefore);
    expect(after.donDeckCount).toBe(donDeckBefore);
    expect(after.hand.length).toBe(handBefore);
    expect(after.deckCount).toBe(deckBefore);
    expect(after.trash.length).toBe(trashBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
