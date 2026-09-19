import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import {
  op12Fullbody052,
  op16KouzukiMomonosuke084,
  op16KouzukiMomonosuke085,
  op16Yamato079,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";
import { registerCards } from "../../../../cards/src/runtime-catalog.ts";

/**
 * OP16-084 Kouzuki Momonosuke
 *   [Activate: Main] You may trash this Character with a cost of 20 or more:
 *   If you have 9 or more DON!! cards on your field, play up to 1
 *   [Kouzuki Momonosuke] with a cost of 9 from your trash.
 *
 * The parser produced the DON!! condition and the play-from-trash filters
 * correctly but dropped the "with a cost of 20 or more" gate entirely. That
 * gate is the subject of this proof.
 *
 * Proof pattern notes:
 *  - TrashThisCardCost carries no filters, so the gate is an effect-level
 *    cardState/this/cost condition.
 *  - Momonosuke's printed cost is 5, so the ability is inert until an outside
 *    effect inflates it past 20.
 */

/** Minimal source that inflates a Character's cost, to cross the 20 threshold. */
const costInflator: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-COST-INFLATOR",
  canonicalId: "TEST-COST-INFLATOR",
  slug: "test-cost-inflator",
  name: "Test Cost Inflator",
  effects: {
    permanentEffects: [
      {
        actions: [
          {
            action: "modifyCost",
            target: {
              player: "self",
              zones: ["character"],
              count: { amount: "all" },
              filters: [{ filter: "name", value: "Kouzuki Momonosuke" }],
            },
            value: 20,
            duration: "permanent",
          },
        ],
      },
    ],
  },
};
registerCards([costInflator]);

const setup = (withInflator: boolean) =>
  OnePieceTestEngine.create(
    {
      leaderCardId: op16Yamato079,
      character: withInflator
        ? [
            { card: op16KouzukiMomonosuke084, playedOnTurn: 0 },
            { card: costInflator, playedOnTurn: 0 },
          ]
        : [{ card: op16KouzukiMomonosuke084, playedOnTurn: 0 }],
      trash: [{ card: op16KouzukiMomonosuke085 }],
      activeDon: 9,
      life: 3,
    },
    { life: 3 },
    { firstPlayer: "south", activeSeat: "south" },
  );

describe("OP16-084 Kouzuki Momonosuke", () => {
  test("at a cost of 20 or more, trashes itself to revive the cost-9 Momonosuke", () => {
    const engine = setup(true);
    const momoId = engine.findCardInZone("south", "character", op16KouzukiMomonosuke084);

    // Printed cost 5, inflated past the 20 threshold.
    expect(op16KouzukiMomonosuke084.cost).toBe(5);

    engine.activateMain(op16KouzukiMomonosuke084, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const pick = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (pick?.kind !== "selectEntity") throw new Error("Expected the revive prompt.");
    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [pick.candidates[0]!.ref.id] },
      "south",
    );

    const view = engine.getView("south");
    // The activating copy paid itself into the trash.
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(momoId);
    // The cost-9 copy came back from the trash onto the board.
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.cardId)).toContain(
      op16KouzukiMomonosuke085.id,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("declining the optional leaves the board and trash untouched", () => {
    const engine = setup(true);
    const momoId = engine.findCardInZone("south", "character", op16KouzukiMomonosuke084);
    const before = engine.getView("south").players.south;
    const trashBefore = before.trash.length;
    const boardBefore = before.characters.filter(Boolean).length;

    engine.activateMain(op16KouzukiMomonosuke084, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    // Nothing paid: this copy stays on the board and nothing is revived.
    expect(after.characters.filter(Boolean).map((card) => card?.instanceId)).toContain(momoId);
    expect(after.characters.filter(Boolean)).toHaveLength(boardBefore);
    expect(after.trash).toHaveLength(trashBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("below a cost of 20, the ability is unavailable", () => {
    const engine = setup(false);
    const momoId = engine.findCardInZone("south", "character", op16KouzukiMomonosuke084);
    const before = engine.getView("south").players.south;

    // The printed cost of 5 fails the cardState gate, so nothing resolves.
    expect(() => engine.activateMain(op16KouzukiMomonosuke084, "south")).toThrow();

    const after = engine.getView("south").players.south;
    expect(after.characters.filter(Boolean).map((card) => card?.instanceId)).toContain(momoId);
    expect(after.trash).toHaveLength(before.trash.length);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
