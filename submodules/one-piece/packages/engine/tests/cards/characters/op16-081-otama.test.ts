import { describe, expect, test } from "vite-plus/test";
import {
  op12EdwardNewgate002,
  op16Otama081,
  op16Yamato079,
  op16Yamato096,
  op17Izo003,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-081 Otama
 *   [Activate: Main] You may rest this Character: If you have a Character with
 *   a cost of 8 or more, give up to 1 of your opponent's Characters -2000
 *   power during this turn.
 *
 * Proof pattern notes:
 *  - The rest cost and the cost-8 board condition are proven independently,
 *    so passing one cannot mask the other.
 *  - OP16-096 Yamato is cost 8; OP17-003 Izo is cost 4.
 */
describe("OP16-081 Otama", () => {
  const setup = (bigAlly: boolean) =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [
          { card: op16Otama081, playedOnTurn: 0 },
          { card: bigAlly ? op16Yamato096 : op17Izo003, playedOnTurn: 0 },
        ],
        activeDon: 10,
        life: 3,
      },
      { character: [{ card: op12EdwardNewgate002, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("with a cost-8 ally, rests itself to weaken an opponent Character", () => {
    const engine = setup(true);
    const otamaId = engine.findCardInZone("south", "character", op16Otama081);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.activateMain(op16Otama081, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [victimId] }, "south");

    const view = engine.getView("south");
    // The rest cost was paid.
    expect(view.players.south.characters.find((card) => card?.instanceId === otamaId)?.rested).toBe(
      true,
    );
    // OP12-002 Edward.Newgate is 6000 power; -2000 leaves 4000.
    expect(view.players.north.characters.find((card) => card?.instanceId === victimId)?.power).toBe(
      4000,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("without a cost-8 ally the condition fails and nothing is weakened", () => {
    const engine = setup(false);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.activateMain(op16Otama081, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const view = engine.getView("south");
    // Cost-4 Izo does not satisfy the cost-8 board requirement.
    expect(view.players.north.characters.find((card) => card?.instanceId === victimId)?.power).toBe(
      6000,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("declining leaves Otama active and the opponent untouched", () => {
    const engine = setup(true);
    const otamaId = engine.findCardInZone("south", "character", op16Otama081);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.activateMain(op16Otama081, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south");
    expect(
      view.players.south.characters.find((card) => card?.instanceId === otamaId)?.rested,
    ).toBeFalsy();
    expect(view.players.north.characters.find((card) => card?.instanceId === victimId)?.power).toBe(
      6000,
    );
    expect(view.prompts).toHaveLength(0);
  });
});
