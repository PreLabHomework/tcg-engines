import { describe, expect, test } from "vite-plus/test";
import { op12EdwardNewgate002, op17Haruta009, op17InuarashiNekomamushi004 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-009 Haruta
 *   [Opponent's Turn] This Character gains +3000 power.
 *   [On Play] K.O. up to 1 of your opponent's Characters with 2000 base power
 *   or less.
 *
 * Proof pattern notes:
 *  - Selection: the K.O. filter is on BASE power, so a buffed 2000-base
 *    Character stays eligible.
 *  - Continuous [Opponent's Turn] buffs need an actual turn boundary.
 */
describe("OP17-009 Haruta", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      { hand: [{ card: op17Haruta009 }], activeDon: 4, life: 3 },
      {
        character: [
          // 2000 base power -> eligible. 6000 base power -> not.
          { card: op17InuarashiNekomamushi004, playedOnTurn: 0 },
          { card: op12EdwardNewgate002, playedOnTurn: 0 },
        ],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("K.O.s only an opponent Character with 2000 base power or less", () => {
    const engine = setup();
    const eligibleId = engine.findCardInZone("north", "character", op17InuarashiNekomamushi004);
    const tooBigId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.play(op17Haruta009, "south");

    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected Haruta's K.O. prompt.");
    const candidateIds = target.candidates.map((candidate) => candidate.ref.id);
    expect(candidateIds).toEqual([eligibleId]);
    expect(candidateIds).not.toContain(tooBigId);
    engine.resolveDecision("effectTargetSelection", { selectedIds: [eligibleId] }, "south");

    const view = engine.getView("south");
    expect(view.players.north.trash.map((card) => card.instanceId)).toContain(eligibleId);
    expect(view.players.north.characters.filter(Boolean)).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });

  test("gains +3000 power only during the opponent's turn", () => {
    const engine = setup();
    engine.play(op17Haruta009, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [] }, "south");

    const harutaId = engine.findCardInZone("south", "character", op17Haruta009);
    const own = engine
      .getView("south")
      .players.south.characters.find((card) => card?.instanceId === harutaId);
    // Printed 5000, unbuffed on our own turn.
    expect(own?.power).toBe(5000);

    engine.endTurn("south");

    const opponentTurn = engine
      .getView("south")
      .players.south.characters.find((card) => card?.instanceId === harutaId);
    expect(opponentTurn?.power).toBe(8000);
  });
});
