import { describe, expect, test } from "vite-plus/test";
import {
  op03Nami040,
  op16KouzukiMomonosuke084,
  op16KouzukiMomonosuke085,
  op17Izo003,
  op17KouzukiOden007,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-085 Kouzuki Momonosuke
 *   [Blocker]
 *   [On Play] Play up to 1 {Land of Wano} type Character card with a cost of 6
 *   or less other than [Kouzuki Momonosuke] from your trash.
 *
 * Proof pattern notes:
 *  - Three filters must all hold: {Land of Wano}, cost <= 6, and a name
 *    exclusion. Each is given its own disqualified card in the trash.
 *  - A neutral Leader is used so the Yamato leader's trash-play Rush grant
 *    does not confound the assertions.
 */
describe("OP16-085 Kouzuki Momonosuke", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op03Nami040,
        hand: [{ card: op16KouzukiMomonosuke085 }],
        trash: [
          { card: op17Izo003 }, // {Land of Wano}, cost 4 -> eligible
          { card: op16KouzukiMomonosuke084 }, // {Land of Wano} cost 5, but excluded by name
          { card: op17KouzukiOden007 }, // {Land of Wano}, cost 7 -> too expensive
        ],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("carries [Blocker]", () => {
    expect(op16KouzukiMomonosuke085.effects?.keywords).toContain("blocker");
  });

  test("revives only the eligible {Land of Wano} Character from trash", () => {
    const engine = setup();

    engine.play(op16KouzukiMomonosuke085, "south");

    const pick = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (pick?.kind !== "selectEntity") throw new Error("Expected the revive prompt.");
    const byCard = (cardId: string) =>
      pick.candidates.some(
        (candidate) => engine.getState().cards[candidate.ref.id]?.cardId === cardId,
      );

    expect(byCard(op17Izo003.id)).toBe(true);
    // Excluded by name, despite being {Land of Wano} at cost 5.
    expect(byCard(op16KouzukiMomonosuke084.id)).toBe(false);
    // Excluded by cost, despite being {Land of Wano} and differently named.
    expect(byCard(op17KouzukiOden007.id)).toBe(false);
    expect(pick.candidates).toHaveLength(1);

    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [pick.candidates[0]!.ref.id] },
      "south",
    );

    const view = engine.getView("south");
    const board = view.players.south.characters.filter(Boolean).map((card) => card?.cardId);
    expect(board).toContain(op16KouzukiMomonosuke085.id);
    expect(board).toContain(op17Izo003.id);
    expect(view.prompts).toHaveLength(0);
  });

  test("declining the revive leaves the trash untouched", () => {
    const engine = setup();
    const trashBefore = engine.getView("south").players.south.trash.length;

    engine.play(op16KouzukiMomonosuke085, "south");
    engine.resolveDecision("effectPlaySelection", { selectedIds: [] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.trash).toHaveLength(trashBefore);
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });
});
