import { describe, expect, test } from "vite-plus/test";
import { op16ShimotsukiUshimaru088, op16Yamato079, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-088 Shimotsuki Ushimaru
 *   [Blocker]
 *
 * Keyword-only card. The keyword is proven through the actual block flow
 * rather than by reading the definition: the opponent attacks the Leader and
 * Ushimaru redirects the attack onto itself.
 */
describe("OP16-088 Shimotsuki Ushimaru", () => {
  test("[Blocker] redirects an attack away from the Leader", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [{ card: op16ShimotsukiUshimaru088, playedOnTurn: 0 }],
        life: 3,
      },
      { character: [{ card: op17Jozu008, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const blockerId = engine.findCardInZone("south", "character", op16ShimotsukiUshimaru088);
    const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleBlocker", { selectedIds: [blockerId] }, "south");

    const view = engine.getView("south");
    // The Leader took no damage because the attack was redirected.
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    // Ushimaru rested to block and was K.O.'d by the 8000 attacker.
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(blockerId);
    expect(view.prompts).toHaveLength(0);
  });

  test("declining to block lets the attack through to the Leader", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [{ card: op16ShimotsukiUshimaru088, playedOnTurn: 0 }],
        life: 3,
      },
      { character: [{ card: op17Jozu008, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const blockerId = engine.findCardInZone("south", "character", op16ShimotsukiUshimaru088);
    const attackerId = engine.findCardInZone("north", "character", op17Jozu008);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleBlocker", { selectedIds: [] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore - 1);
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.instanceId)).toContain(
      blockerId,
    );
    expect(view.prompts).toHaveLength(0);
  });
});
