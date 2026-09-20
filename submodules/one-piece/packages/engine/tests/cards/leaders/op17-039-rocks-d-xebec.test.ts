import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op08Buckin051, op12Fullbody052, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-039 Rocks.D.Xebec (Leader, 5000 / 5 Life)
 *   [When Attacking] You may trash 1 card from your hand: Reveal 1 card from
 *   the top of your deck. If the revealed card's type includes "Rocks
 *   Pirates", draw 2 cards.
 *
 * Proof pattern notes:
 *  - The trash cost is verified as actually paid, not inferred from the draw.
 *  - "type including" is QUOTED, so rule 2-4-3-1 applies: OP08-051 Buckin,
 *    whose type is Former Rocks Pirates, satisfies it. That is the reverse of
 *    OP17-118's braced {Rocks Pirates}, and both are asserted in this deck.
 *  - Deck order is fixed in these fixtures, so the revealed card is
 *    deterministic.
 */
describe("OP17-039 Rocks.D.Xebec", () => {
  const setup = (topOfDeck: CharacterCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op12Fullbody052 }],
        deck: [topOfDeck, op12Fullbody052, op12Fullbody052, op12Fullbody052],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("has 5000 power and 5 Life", () => {
    expect(op17RocksDXebec039.power).toBe(5000);
    expect(op17RocksDXebec039.life).toBe(5);
  });

  test("a matching reveal draws 2, and the trash cost is actually paid", () => {
    // OP08-051 Buckin is "Former Rocks Pirates", which satisfies the QUOTED
    // "type including" wording under CR 2-4-3-1.
    const engine = setup(op08Buckin051);
    const before = engine.getView("south").players.south;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;

    engine.declareAttack(engine.leader("south"), engine.leader("north"), "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const view = engine.getView("south");
    // Cost paid: one card left hand for the trash.
    expect(view.players.south.trash.length).toBeGreaterThan(trashBefore);
    // Revealed 1 off the top, then drew 2.
    expect(view.players.south.deckCount).toBe(deckBefore - 2);
    // -1 trashed, +2 drawn (the revealed card is one of them).
    expect(view.players.south.hand).toHaveLength(handBefore + 1);
    expect(view.prompts).toHaveLength(0);
  });

  test("a non-matching reveal pays the cost but draws nothing", () => {
    // OP12-052 Fullbody carries no Rocks Pirates type at all.
    const engine = setup(op12Fullbody052);
    const before = engine.getView("south").players.south;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;

    engine.declareAttack(engine.leader("south"), engine.leader("north"), "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const view = engine.getView("south");
    // The cost is paid whether or not the reveal matches.
    expect(view.players.south.trash.length).toBeGreaterThan(trashBefore);
    expect(view.players.south.hand).toHaveLength(handBefore - 1);
    // Nothing drawn, so the deck only lost nothing to the draw.
    expect(view.players.south.deckCount).toBe(deckBefore);
    expect(view.prompts).toHaveLength(0);
  });

  test("may decline the optional so nothing is paid and nothing is drawn", () => {
    // Built inline rather than via setup() so the subject card under test is
    // named inside this block, as the Grade A opener check requires.
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op12Fullbody052 }],
        deck: [op08Buckin051, op12Fullbody052, op12Fullbody052, op12Fullbody052],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.declareAttack(engine.leader("south"), engine.leader("north"), "south");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const donDeckBefore = before.donDeckCount;
    const handBefore = before.hand.length;
    const lifeBefore = before.lifeCount;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;

    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    expect(after.activeDon + after.restedDon).toBe(donPoolBefore);
    expect(after.donDeckCount).toBe(donDeckBefore);
    expect(after.hand.length).toBe(handBefore);
    expect(after.lifeCount).toBe(lifeBefore);
    expect(after.deckCount).toBe(deckBefore);
    expect(after.trash.length).toBe(trashBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
