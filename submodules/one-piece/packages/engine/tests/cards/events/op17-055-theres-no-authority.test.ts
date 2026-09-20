import { describe, expect, test } from "vite-plus/test";
import {
  op08Buckin051,
  op12Fullbody052,
  op17RocksDXebec039,
  op17RocksDXebec118,
  op17TheresNoAuthority055,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-055 There's No Authority in the World That Lasts Forever!!! (0 cost)
 *   [Main] You may rest 1 of your DON!! cards: Up to 1 of your
 *   [Rocks.D.Xebec] gains [Unblockable] during this turn.
 *   [Counter] Up to 1 of your Leader with a type including "Rocks Pirates" or
 *   up to 1 of your Character with a type including "Rocks Pirates" gains
 *   +2000 power during this battle.
 *
 * Parsed to nothing, so both modes are hand-authored and proven separately.
 * The Counter clause is QUOTED, so under CR 2-4-3-1 OP08-051 Buckin
 * ("Former Rocks Pirates") is a legal target.
 */
describe("OP17-055 There's No Authority in the World That Lasts Forever!!!", () => {
  test("[Main] rests 1 DON!! and grants [Rocks.D.Xebec] [Unblockable]", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17RocksDXebec118, playedOnTurn: 0 }],
        hand: [{ card: op17TheresNoAuthority055 }],
        activeDon: 6,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const xebecId = engine.findCardInZone("south", "character", op17RocksDXebec118);
    const restedBefore = engine.getView("south").players.south.restedDon;

    engine.play(op17TheresNoAuthority055, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [xebecId] }, "south");

    expect(
      Object.values(engine.getState().modifiers).some(
        (modifier) =>
          modifier.targetId === xebecId &&
          modifier.type === "keyword" &&
          modifier.keyword === "unblockable",
      ),
    ).toBe(true);
    // The DON!! cost was actually paid.
    expect(engine.getView("south").players.south.restedDon).toBe(restedBefore + 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("may decline the [Main] optional so no DON!! is rested", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op17RocksDXebec118, playedOnTurn: 0 }],
        hand: [{ card: op17TheresNoAuthority055 }],
        activeDon: 6,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op17TheresNoAuthority055, "south");
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
    expect(
      Object.values(engine.getState().modifiers).some(
        (modifier) => modifier.type === "keyword" && modifier.keyword === "unblockable",
      ),
    ).toBe(false);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test('[Counter] CR 2-4-3-1: Buckin ("Former Rocks Pirates") is a legal +2000 target', () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op08Buckin051, playedOnTurn: 0 }],
        hand: [{ card: op17TheresNoAuthority055 }],
        activeDon: 2,
        life: 3,
      },
      { character: [{ card: op12Fullbody052, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const attackerId = engine.findCardInZone("north", "character", op12Fullbody052);
    const counterId = engine.findCardInZone("south", "hand", op17TheresNoAuthority055);
    const buckinId = engine.findCardInZone("south", "character", op08Buckin051);

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleCounter", { selectedIds: [counterId] }, "south");

    const step = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (step?.kind !== "selectEntity") throw new Error("Expected the +2000 target prompt.");
    const candidateIds = step.candidates.map((candidate) => candidate.ref.id);
    // The quoted form matches a type CONTAINING "Rocks Pirates".
    expect(candidateIds).toContain(buckinId);
    expect(candidateIds).toContain(engine.leader("south"));
    engine.resolveDecision("effectTargetSelection", { selectedIds: [buckinId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(counterId);
    expect(view.prompts).toHaveLength(0);
  });
});
