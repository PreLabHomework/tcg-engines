import { describe, expect, test } from "vite-plus/test";
import { op12Fullbody052, op17InuarashiNekomamushi004, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-004 Inuarashi & Nekomamushi
 *   [On Play] Up to 1 of your {Land of Wano} type Characters or up to 1 of your
 *   Characters with a type including "Whitebeard Pirates" gains [Rush] during
 *   this turn.
 *
 * Parsed to nothing, so the entire effect is hand-authored. The dual-trait
 * target uses anyOf.groups. OP17-008 Jozu carries {Whitebeard Pirates};
 * OP12-052 Fullbody carries neither trait.
 */
describe("OP17-004 Inuarashi & Nekomamushi", () => {
  test("grants [Rush], letting a Character played this turn attack immediately", () => {
    const engine = OnePieceTestEngine.create(
      {
        hand: [{ card: op17Jozu008 }, { card: op17InuarashiNekomamushi004 }],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op17Jozu008, "south");
    const jozuId = engine.findCardInZone("south", "character", op17Jozu008);
    const lifeBefore = engine.getView("south").players.north.lifeCount;

    engine.play(op17InuarashiNekomamushi004, "south");

    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    expect(target?.kind).toBe("selectEntity");
    if (target?.kind !== "selectEntity") throw new Error("Expected a Rush target prompt.");
    expect(target.candidates.map((candidate) => candidate.ref.id)).toContain(jozuId);
    engine.resolveDecision("effectTargetSelection", { selectedIds: [jozuId] }, "south");

    expect(Object.values(engine.getState().modifiers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: jozuId, type: "keyword", keyword: "rush" }),
      ]),
    );

    // Jozu was played this turn, so only the granted Rush permits this attack.
    engine.declareAttack(jozuId, engine.leader("north"), "south");
    expect(engine.getView("south").players.north.lifeCount).toBe(lifeBefore - 1);
  });

  test("filters out Characters carrying neither trait", () => {
    const engine = OnePieceTestEngine.create(
      {
        character: [{ card: op12Fullbody052, playedOnTurn: 0 }],
        hand: [{ card: op17InuarashiNekomamushi004 }],
        activeDon: 3,
        life: 3,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );
    const fullbodyId = engine.findCardInZone("south", "character", op12Fullbody052);

    engine.play(op17InuarashiNekomamushi004, "south");

    const inuarashiId = engine.findCardInZone("south", "character", op17InuarashiNekomamushi004);

    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected a Rush target prompt.");
    const candidateIds = target.candidates.map((candidate) => candidate.ref.id);

    // Fullbody carries neither trait. Inuarashi itself carries both
    // {Land of Wano} and {Whitebeard Pirates}, so it is legally targetable.
    expect(candidateIds).not.toContain(fullbodyId);
    expect(candidateIds).toEqual([inuarashiId]);
  });
});
