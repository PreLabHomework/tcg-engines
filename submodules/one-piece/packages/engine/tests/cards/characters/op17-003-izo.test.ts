import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import { op02EdwardNewgate001, op03Nami040, op12EdwardNewgate002, op17Izo003 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-003 Izo
 *   [Rush: Character]
 *   [On Play] If your Leader is [Edward.Newgate] or has the {Land of Wano}
 *   type, give up to 1 of your opponent's rested Characters -6000 power during
 *   this turn.
 *
 * Proof pattern notes:
 *  - Selection: candidates are filtered to rested opponent Characters only.
 *  - Condition: the leader clause is an OR of leaderName / leaderTrait.
 */
describe("OP17-003 Izo", () => {
  const setup = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      { leaderCardId, hand: [{ card: op17Izo003 }], activeDon: 4, life: 3 },
      {
        character: [
          { card: op12EdwardNewgate002, rested: true, playedOnTurn: 0 },
          { card: op12EdwardNewgate002, playedOnTurn: 0 },
        ],
      },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("with an [Edward.Newgate] Leader, weakens a rested opponent Character", () => {
    const engine = setup(op02EdwardNewgate001);
    const restedId = engine
      .getView("north")
      .players.north.characters.find((card) => card?.rested)?.instanceId;
    if (!restedId) throw new Error("Expected a rested opponent Character.");

    engine.play(op17Izo003, "south");

    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected Izo's target prompt.");
    const candidateIds = target.candidates.map((candidate) => candidate.ref.id);
    // Only the rested opponent Character is eligible.
    expect(candidateIds).toEqual([restedId]);
    engine.resolveDecision("effectTargetSelection", { selectedIds: [restedId] }, "south");

    const weakened = engine
      .getView("south")
      .players.north.characters.find((card) => card?.instanceId === restedId);
    // OP12-002 Edward.Newgate is 6000 power; -6000 takes it to 0.
    expect(weakened?.power).toBe(0);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("does nothing when the Leader is neither [Edward.Newgate] nor {Land of Wano}", () => {
    const engine = setup(op03Nami040);
    const before = engine
      .getView("north")
      .players.north.characters.filter(Boolean)
      .map((card) => card?.power);

    engine.play(op17Izo003, "south");

    const after = engine
      .getView("north")
      .players.north.characters.filter(Boolean)
      .map((card) => card?.power);
    expect(after).toEqual(before);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("carries the [Rush: Character] keyword", () => {
    expect(op17Izo003.effects?.keywords).toContain("rushCharacter");
  });
});
