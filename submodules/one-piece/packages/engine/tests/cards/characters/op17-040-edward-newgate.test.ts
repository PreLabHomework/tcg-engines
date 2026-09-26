import { describe, expect, test } from "vite-plus/test";
import { op12Fullbody052, op17EdwardNewgate040, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-040 Edward.Newgate
 *   [On Play] Draw 1 card.
 *   [Once Per Turn] When your Leader with a type including "Rocks Pirates"
 *   attacks or is attacked, you may trash 1 card from your hand to activate
 *   this effect. Your Leader gains +3000 power during this battle.
 *
 * The parser kept only the draw and dropped the whole attack clause.
 *
 * Proof pattern notes:
 *  - "attacks" and "is attacked" are two distinct engine events, so they get
 *    independent cases rather than one standing in for the other.
 *  - The quoted "Rocks Pirates" wording is CR 2-4-3-1.
 */
describe("OP17-040 Edward.Newgate", () => {
  test("[On Play] draws 1", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17EdwardNewgate040 }],
        deck: [op12Fullbody052, op12Fullbody052],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const before = engine.getView("south").players.south;

    engine.play(op17EdwardNewgate040, "south");

    const after = engine.getView("south").players.south;
    // Played it (-1), drew 1 (+1).
    expect(after.hand.length).toBe(before.hand.length);
    expect(after.deckCount).toBe(before.deckCount - 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("when your Leader ATTACKS, trashing 1 gives it +3000 for the battle", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17EdwardNewgate040, playedOnTurn: 0 }],
        hand: [{ card: op12Fullbody052 }],
        activeDon: 10,
        life: 3,
      },
      { character: [{ card: op12Fullbody052, rested: true, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const defenderId = engine.findCardInZone("north", "character", op12Fullbody052);
    const trashBefore = engine.getView("south").players.south.trash.length;

    // The 5000 Leader attacks a rested 6000 Character: it needs the +3000.
    engine.declareAttack(engine.leader("south"), defenderId, "south");
    // The OP17-039 Leader has its own [When Attacking] optional; decline it so
    // only OP17-040's clause is under test.
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const view = engine.getView("south");
    // Cost paid, and the boosted Leader destroyed the bigger Character.
    expect(view.players.south.trash.length).toBe(trashBefore + 1);
    expect(view.players.north.characters.filter(Boolean)).toHaveLength(0);
    expect(view.prompts).toHaveLength(0);
  });

  test("when your Leader IS ATTACKED, trashing 1 gives it +3000 for the battle", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17EdwardNewgate040, playedOnTurn: 0 }],
        hand: [{ card: op12Fullbody052 }],
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op12Fullbody052);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    // A 6000 attacker into the 5000 Leader; +3000 reaches 8000 and repels it.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    expect(view.prompts).toHaveLength(0);
  });

  test("may decline the optional when the Leader is attacked", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17EdwardNewgate040, rested: true, playedOnTurn: 0 }],
        hand: [{ card: op12Fullbody052 }],
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op12Fullbody052);
    // Attack the 8000 Newgate rather than the Leader: a 6000 attacker fails,
    // so no Life card moves into hand to confound the economy snapshot.
    const newgateId = engine.findCardInZone("south", "character", op17EdwardNewgate040);

    engine.declareAttack(attackerId, newgateId, "north");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const donDeckBefore = before.donDeckCount;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;
    const lifeBefore = before.lifeCount;

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
