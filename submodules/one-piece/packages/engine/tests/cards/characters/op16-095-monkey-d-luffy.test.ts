import { describe, expect, test } from "vite-plus/test";
import { op16MonkeyDLuffy095, op16Yamato079, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-095 Monkey.D.Luffy
 *   [On Play] Up to 1 of your black {Land of Wano} type Characters gains
 *   [Unblockable] during this turn.
 *
 * Proof pattern notes:
 *  - The target must satisfy BOTH colour and trait; OP17-008 Jozu is red and
 *    {Whitebeard Pirates}, so it must be excluded from the candidate pool.
 *  - Luffy itself is black {Land of Wano}, so it is legally self-targetable.
 */
describe("OP16-095 Monkey.D.Luffy", () => {
  const setup = (board: { card: typeof op17Jozu008 }[]) =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: board.map((entry) => ({ ...entry, playedOnTurn: 0 })),
        hand: [{ card: op16MonkeyDLuffy095 }],
        activeDon: 6,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("grants [Unblockable] to an eligible black {Land of Wano} Character", () => {
    const engine = setup([]);

    engine.play(op16MonkeyDLuffy095, "south");
    const luffyId = engine.findCardInZone("south", "character", op16MonkeyDLuffy095);

    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected the Unblockable prompt.");
    expect(target.candidates.map((candidate) => candidate.ref.id)).toEqual([luffyId]);
    engine.resolveDecision("effectTargetSelection", { selectedIds: [luffyId] }, "south");

    expect(Object.values(engine.getState().modifiers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: luffyId,
          type: "keyword",
          keyword: "unblockable",
        }),
      ]),
    );
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("excludes Characters failing the colour or trait filter", () => {
    const engine = setup([{ card: op17Jozu008 }]);
    const jozuId = engine.findCardInZone("south", "character", op17Jozu008);

    engine.play(op16MonkeyDLuffy095, "south");

    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected the Unblockable prompt.");
    // OP17-008 Jozu is red {Whitebeard Pirates}; it satisfies neither filter.
    expect(target.candidates.map((candidate) => candidate.ref.id)).not.toContain(jozuId);
    engine.resolveDecision("effectTargetSelection", { selectedIds: [] }, "south");

    expect(Object.values(engine.getState().modifiers)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: jozuId, type: "keyword", keyword: "unblockable" }),
      ]),
    );
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the grant expires at the turn boundary", () => {
    const engine = setup([]);

    engine.play(op16MonkeyDLuffy095, "south");
    const luffyId = engine.findCardInZone("south", "character", op16MonkeyDLuffy095);
    engine.resolveDecision("effectTargetSelection", { selectedIds: [luffyId] }, "south");

    engine.endTurn("south");

    expect(Object.values(engine.getState().modifiers)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: luffyId, type: "keyword", keyword: "unblockable" }),
      ]),
    );
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
