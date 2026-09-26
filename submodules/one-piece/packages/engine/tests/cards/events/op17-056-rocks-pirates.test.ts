import { describe, expect, test } from "vite-plus/test";
import {
  op08Buckin051,
  op12Fullbody052,
  op17RocksDXebec039,
  op17RocksPirates056,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-056 Rocks Pirates (0 cost)
 *   [Main] You may rest 5 of your DON!! cards: Return up to 1 Character with
 *   a cost of 6 or less to the owner's hand.
 *   [Counter] Up to 1 of your Leader with a type including "Rocks Pirates" or
 *   up to 1 of your Characters with a type including "Rocks Pirates" gains
 *   +2000 power during this battle.
 *
 * The parser produced the [Main] mode correctly but dropped the [Counter]
 * mode entirely. Both are proven separately here.
 */
describe("OP17-056 Rocks Pirates", () => {
  test("[Main] rests 5 DON!! and bounces a cost-6-or-less Character", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17RocksPirates056 }],
        activeDon: 8,
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const victimId = engine.findCardInZone("north", "character", op12Fullbody052);
    const restedBefore = engine.getView("south").players.south.restedDon;

    engine.play(op17RocksPirates056, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [victimId] }, "south");

    const view = engine.getView("south");
    // The five DON!! were actually rested.
    expect(view.players.south.restedDon).toBe(restedBefore + 5);
    expect(view.players.north.characters.filter(Boolean)).toHaveLength(0);
    expect(view.prompts).toHaveLength(0);
  });

  test("may decline the [Main] optional so no DON!! is rested and nothing bounces", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17RocksPirates056 }],
        activeDon: 8,
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op17RocksPirates056, "south");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const restedBefore = before.restedDon;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;

    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    expect(after.activeDon + after.restedDon).toBe(donPoolBefore);
    expect(after.restedDon).toBe(restedBefore);
    expect(after.hand.length).toBe(handBefore);
    expect(after.deckCount).toBe(deckBefore);
    expect(engine.getView("south").players.north.characters.filter(Boolean)).toHaveLength(1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("[Counter] gives a Rocks Pirates Leader or Character +2000 this battle", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op08Buckin051, playedOnTurn: 0 }],
        hand: [{ card: op17RocksPirates056 }],
        activeDon: 2,
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op12Fullbody052);
    const counterId = engine.findCardInZone("south", "hand", op17RocksPirates056);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleCounter", { selectedIds: [counterId] }, "south");
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [engine.leader("south")] },
      "south",
    );

    const view = engine.getView("south");
    // The 5000 Leader reached 7000 against a 6000 attacker, so no Life was lost.
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(counterId);
    expect(view.prompts).toHaveLength(0);
  });
});
