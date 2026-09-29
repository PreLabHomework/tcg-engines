import { describe, expect, test } from "vite-plus/test";
import {
  op17Jozu008,
  op17KouzukiOden007,
  op17MissBuckinghamStussy054,
  op17RocksDXebec039,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-054 Miss Buckingham Stussy
 *   [On Play] Up to 1 of your opponent's Characters with a base cost of 6 or
 *   less cannot attack until the end of your opponent's next End Phase.
 *   [Activate: Main] You may rest 3 of your DON!! cards and this Character:
 *   Up to 1 of your opponent's Characters cannot attack until the end of your
 *   opponent's next End Phase.
 *
 * Proof pattern notes:
 *  - "Cannot attack" is proven behaviourally: the attack is refused. The
 *    duration is proven by walking real turns and showing the SAME Character
 *    can attack again once the opponent's next End Phase has passed.
 *  - OP17-008 Jozu is base cost 6 (eligible for [On Play]); OP17-007 Kouzuki
 *    Oden is base cost 7 (not). [Activate: Main] has no cost filter.
 */
describe("OP17-054 Miss Buckingham Stussy", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17MissBuckinghamStussy054 }],
        activeDon: 10,
        life: 5,
      },
      {
        character: [
          { card: op17Jozu008, playedOnTurn: 0 },
          { card: op17KouzukiOden007, playedOnTurn: 0 },
        ],
        life: 5,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("[On Play] a base-cost-6 target cannot attack on the opponent's next turn", () => {
    const engine = setup();
    const jozuId = engine.findCardInZone("north", "character", op17Jozu008);

    engine.play(op17MissBuckinghamStussy054, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [jozuId] }, "south");
    expect(engine.getView("south").prompts).toHaveLength(0);

    engine.endTurn();
    expect(engine.getState().activeSeat).toBe("north");
    // Refused outright rather than merely weakened.
    expect(() => engine.declareAttack(jozuId, engine.leader("south"), "north")).toThrow();
  });

  test("the restriction lifts after the opponent's next End Phase", () => {
    const engine = setup();
    const jozuId = engine.findCardInZone("north", "character", op17Jozu008);

    engine.play(op17MissBuckinghamStussy054, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [jozuId] }, "south");

    engine.endTurn(); // -> north's turn: restricted
    expect(() => engine.declareAttack(jozuId, engine.leader("south"), "north")).toThrow();
    engine.endTurn(); // north's End Phase passes -> south's turn
    engine.endTurn(); // -> north's following turn

    // The same Character may attack again, and the attack connects.
    const lifeBefore = engine.getView("south").players.south.lifeCount;
    engine.declareAttack(jozuId, engine.leader("south"), "north");
    // South drew on its own turn in between, so it reaches the counter step.
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "south");
    expect(engine.getView("south").players.south.lifeCount).toBe(lifeBefore - 1);
  });

  test("[On Play] a base-cost-7 Character is not an eligible target", () => {
    const engine = setup();
    const jozuId = engine.findCardInZone("north", "character", op17Jozu008);
    const odenId = engine.findCardInZone("north", "character", op17KouzukiOden007);

    engine.play(op17MissBuckinghamStussy054, "south");

    const step = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (step?.kind !== "selectEntity") throw new Error("Expected the target prompt.");
    const candidateIds = step.candidates.map((candidate) => candidate.ref.id);
    expect(candidateIds).toContain(jozuId);
    expect(candidateIds).not.toContain(odenId);

    engine.resolveDecision("effectTargetSelection", { selectedIds: [] }, "south");
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("[Activate: Main] rests 3 DON!! and itself to restrict ANY opponent Character", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17MissBuckinghamStussy054, playedOnTurn: 0 }],
        activeDon: 10,
        life: 5,
      },
      { character: [{ card: op17KouzukiOden007, playedOnTurn: 0 }], life: 5 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const stussyId = engine.findCardInZone("south", "character", op17MissBuckinghamStussy054);
    const odenId = engine.findCardInZone("north", "character", op17KouzukiOden007);
    const restedBefore = engine.getView("south").players.south.restedDon;

    engine.activateMain(op17MissBuckinghamStussy054, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    // No cost filter on this clause, so the base-cost-7 Oden is legal here.
    engine.resolveDecision("effectTargetSelection", { selectedIds: [odenId] }, "south");

    const south = engine.getView("south").players.south;
    // Both parts of the cost were actually paid.
    expect(south.restedDon).toBe(restedBefore + 3);
    expect(south.characters.find((card) => card?.instanceId === stussyId)?.rested).toBe(true);
    expect(engine.getView("south").prompts).toHaveLength(0);

    engine.endTurn();
    expect(() => engine.declareAttack(odenId, engine.leader("south"), "north")).toThrow();
  });

  test("may decline [Activate: Main], leaving DON!! and Stussy untouched", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17MissBuckinghamStussy054, playedOnTurn: 0 }],
        activeDon: 10,
        life: 5,
      },
      { character: [{ card: op17KouzukiOden007, playedOnTurn: 0 }], life: 5 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const stussyId = engine.findCardInZone("south", "character", op17MissBuckinghamStussy054);

    engine.activateMain(op17MissBuckinghamStussy054, "south");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const restedBefore = before.restedDon;
    const donDeckBefore = before.donDeckCount;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;

    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    expect(after.activeDon + after.restedDon).toBe(donPoolBefore);
    expect(after.restedDon).toBe(restedBefore);
    expect(after.donDeckCount).toBe(donDeckBefore);
    expect(after.hand.length).toBe(handBefore);
    expect(after.deckCount).toBe(deckBefore);
    expect(after.characters.find((card) => card?.instanceId === stussyId)?.rested).toBeFalsy();
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
