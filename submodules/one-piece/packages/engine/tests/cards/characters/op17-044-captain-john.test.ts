import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import {
  op02EdwardNewgate001,
  op16Nami091,
  op17CaptainJohn044,
  op17Jozu008,
  op17RocksDXebec039,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-044 Captain John
 *   If your Leader's type includes "Rocks Pirates" and this Character is
 *   rested, your opponent cannot attack any card other than the Character
 *   [Captain John].
 *   [Activate: Main] You may rest this Character: Draw 1 card and trash 1
 *   card from your hand.
 *
 * Proven as a truth table rather than one happy path:
 *
 *   Rocks Pirates Leader | John rested || restriction
 *   ---------------------+-------------++------------
 *          yes           |     yes     ||   ACTIVE
 *          no            |     yes     ||   inactive
 *          yes           |     no      ||   inactive
 *
 * The last two rows together show the conditions are conjunctive, not OR'd.
 *
 * "Other than" is proven on BOTH sides: a forbidden target is refused AND the
 * permitted target (John) is still attackable. A refusal alone would also
 * pass under a broken blanket "cannot attack".
 *
 * OP17-039 Rocks.D.Xebec is a Rocks Pirates Leader; OP02-001 Edward.Newgate
 * is not. OP16-091 Nami is a second, rested south Character used as a
 * forbidden target. OP17-008 Jozu (8000) is north's attacker.
 */
const setup = (leaderCardId: LeaderCard, johnRested: boolean) =>
  OnePieceTestEngine.create(
    {
      leaderCardId,
      character: [
        { card: op17CaptainJohn044, rested: johnRested, playedOnTurn: 0 },
        { card: op16Nami091, rested: true, playedOnTurn: 0 },
      ],
      life: 3,
    },
    { character: [{ card: op17Jozu008, playedOnTurn: 0 }], life: 3 },
    { firstPlayer: "south", activeSeat: "north" },
  );

describe("OP17-044 Captain John", () => {
  describe("Rocks Pirates Leader AND John rested: restriction ACTIVE", () => {
    test("attacking the Leader is refused", () => {
      const engine = setup(op17RocksDXebec039, true);
      const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
      const lifeBefore = engine.getView("south").players.south.lifeCount;

      expect(() => engine.declareAttack(attackerId, engine.leader("south"), "north")).toThrow();
      expect(engine.getView("south").players.south.lifeCount).toBe(lifeBefore);
    });

    test("attacking a different rested Character is refused", () => {
      const engine = setup(op17RocksDXebec039, true);
      const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
      const namiId = engine.findCardInZone("south", "character", op16Nami091);

      expect(() => engine.declareAttack(attackerId, namiId, "north")).toThrow();
      expect(
        engine
          .getView("south")
          .players.south.characters.filter(Boolean)
          .map((c) => c?.cardId),
      ).toContain(op16Nami091.id);
    });

    test("attacking Captain John himself is still permitted", () => {
      const engine = setup(op17RocksDXebec039, true);
      const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
      const johnId = engine.findCardInZone("south", "character", op17CaptainJohn044);

      // The permitted side of "other than": this must NOT throw.
      engine.declareAttack(attackerId, johnId, "north");

      // John is 6000 against an 8000 attacker, so the attack lands.
      const view = engine.getView("south");
      expect(view.players.south.trash.map((card) => card.instanceId)).toContain(johnId);
      expect(view.prompts).toHaveLength(0);
    });
  });

  test("non-Rocks Pirates Leader, John rested: restriction inactive", () => {
    const engine = setup(op02EdwardNewgate001, true);
    const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    // The Leader condition fails, so the Leader is a normal target again.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    expect(engine.getView("south").players.south.lifeCount).toBe(lifeBefore - 1);
  });

  test("Rocks Pirates Leader, John ACTIVE: restriction inactive", () => {
    const engine = setup(op17RocksDXebec039, false);
    const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    // The rested condition fails, so the Leader is a normal target again.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    expect(engine.getView("south").players.south.lifeCount).toBe(lifeBefore - 1);
  });

  describe("[Activate: Main]", () => {
    const activateSetup = () =>
      OnePieceTestEngine.create(
        {
          leaderCardId: op17RocksDXebec039,
          character: [{ card: op17CaptainJohn044, playedOnTurn: 0 }],
          hand: [{ card: op16Nami091 }],
          deck: [op17Jozu008, op17Jozu008],
          life: 3,
        },
        { character: [{ card: op17Jozu008, playedOnTurn: 0 }], life: 3 },
        { firstPlayer: "south", activeSeat: "south" },
      );

    test("rests John to draw 1 and trash 1, which also switches the taunt on", () => {
      const engine = activateSetup();
      const johnId = engine.findCardInZone("south", "character", op17CaptainJohn044);
      const before = engine.getView("south").players.south;

      engine.activateMain(op17CaptainJohn044, "south");
      engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
      const discard = engine.pendingDecision("effectTrashFromHandSelection", "south").steps[0];
      if (discard?.kind !== "selectEntity") throw new Error("Expected the discard prompt.");
      engine.resolveDecision(
        "effectTrashFromHandSelection",
        { selectedIds: [discard.candidates[0]!.ref.id] },
        "south",
      );

      const after = engine.getView("south").players.south;
      // The cost: John is now rested.
      expect(after.characters.find((card) => card?.instanceId === johnId)?.rested).toBe(true);
      // Drew 1, trashed 1: hand size unchanged, deck -1, trash +1.
      expect(after.hand.length).toBe(before.hand.length);
      expect(after.deckCount).toBe(before.deckCount - 1);
      expect(after.trash.length).toBe(before.trash.length + 1);
      expect(engine.getView("south").prompts).toHaveLength(0);

      // Real synergy: resting John is what satisfies the rested condition, so
      // on the opponent's next turn the Leader can no longer be attacked.
      engine.endTurn();
      const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
      expect(() => engine.declareAttack(attackerId, engine.leader("south"), "north")).toThrow();
    });

    test("may decline, leaving John active and the hand untouched", () => {
      const engine = activateSetup();
      const johnId = engine.findCardInZone("south", "character", op17CaptainJohn044);

      engine.activateMain(op17CaptainJohn044, "south");
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
      expect(after.characters.find((card) => card?.instanceId === johnId)?.rested).toBeFalsy();
      expect(engine.getView("south").prompts).toHaveLength(0);
    });
  });
});
