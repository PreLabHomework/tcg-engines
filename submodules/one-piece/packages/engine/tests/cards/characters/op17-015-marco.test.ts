import { describe, expect, test } from "vite-plus/test";
import { eb01MountainGod018, op17Jozu008, op17Marco015 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-015 Marco
 *   If one of your Characters would be removed from the field by your
 *   opponent's effect, you may K.O. this Character instead.
 *   [On K.O.] You may trash 1 card with a type including "Whitebeard Pirates"
 *   from your hand: Play this Character card from your trash.
 *
 * The parser dropped the removal-replacement clause entirely, which is why this
 * card was flagged by the semantic audit despite a FULL structural parse.
 */
describe("OP17-015 Marco", () => {
  // OP17-008 Jozu carries the {Whitebeard Pirates} type, so it is a legal
  // payment for Marco's [On K.O.] cost.
  const setup = (hand: { card: typeof op17Jozu008 }[]) =>
    OnePieceTestEngine.create(
      { character: [{ card: op17Marco015, rested: true, playedOnTurn: 0 }], hand },
      { character: [{ card: eb01MountainGod018, playedOnTurn: 0 }] },
      { firstPlayer: "south", activeSeat: "north" },
    );

  test("after being K.O.'d, trashing a Whitebeard Pirates card replays Marco from the trash", () => {
    const engine = setup([{ card: op17Jozu008 }]);
    const marcoId = engine.findCardInZone("south", "character", op17Marco015);
    const attackerId = engine.findCardInZone("north", "character", eb01MountainGod018);

    engine.declareAttack(attackerId, marcoId, "north");
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const view = engine.getView("south");
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(1);
    expect(view.players.south.hand).toHaveLength(0);
    expect(view.players.south.trash.map((card) => card.cardId)).toContain(op17Jozu008.id);
    expect(view.prompts).toHaveLength(0);
  });

  test("declining the [On K.O.] cost leaves Marco in the trash", () => {
    const engine = setup([{ card: op17Jozu008 }]);
    const marcoId = engine.findCardInZone("south", "character", op17Marco015);
    const attackerId = engine.findCardInZone("north", "character", eb01MountainGod018);

    engine.declareAttack(attackerId, marcoId, "north");
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south");
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(0);
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(marcoId);
    expect(view.players.south.hand).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });

  test("with no Whitebeard Pirates card in hand the cost cannot be paid", () => {
    const engine = setup([]);
    const marcoId = engine.findCardInZone("south", "character", op17Marco015);
    const attackerId = engine.findCardInZone("north", "character", eb01MountainGod018);

    engine.declareAttack(attackerId, marcoId, "north");

    const view = engine.getView("south");
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(0);
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(marcoId);
    expect(view.prompts).toHaveLength(0);
  });
});
