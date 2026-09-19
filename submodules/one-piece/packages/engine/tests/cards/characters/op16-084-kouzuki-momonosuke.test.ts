import { describe, expect, test } from "vite-plus/test";
import {
  op16KouzukiMomonosuke084,
  op16KouzukiMomonosuke085,
  op16Shinobu087,
  op16Yamato079,
  op17Jozu008,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-084 Kouzuki Momonosuke
 *   [Activate: Main] You may trash this Character with a cost of 20 or more:
 *   If you have 9 or more DON!! cards on your field, play up to 1
 *   [Kouzuki Momonosuke] with a cost of 9 from your trash.
 *
 * The parser produced the DON!! condition and the play-from-trash filters
 * correctly but dropped "with a cost of 20 or more" entirely. TrashThisCardCost
 * carries no filters, so the gate lives in an effect-level cardState/this/cost
 * condition.
 *
 * The cost inflation is driven by the real deck card that provides it,
 * OP16-087 Shinobu ("up to 1 of your [Kouzuki Momonosuke] gains +20 cost"),
 * rather than a synthetic stand-in, so this doubles as proof that the two
 * cards compose.
 */
describe("OP16-084 Kouzuki Momonosuke", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [{ card: op16KouzukiMomonosuke084, playedOnTurn: 0 }],
        hand: [{ card: op16Shinobu087 }],
        trash: [{ card: op16KouzukiMomonosuke085 }],
        deck: [op17Jozu008, op17Jozu008],
        activeDon: 9,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  /** Plays Shinobu and routes its +20 cost onto Momonosuke. */
  const inflateWithShinobu = (engine: OnePieceTestEngine) => {
    engine.play(op16Shinobu087, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected Shinobu's +20 cost prompt.");
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [target.candidates[0]!.ref.id] },
      "south",
    );
  };

  const costOf = (engine: OnePieceTestEngine) =>
    engine
      .getView("south")
      .players.south.characters.find((card) => card?.cardId === op16KouzukiMomonosuke084.id)?.cost;

  test("Shinobu's +20 lifts it past the gate, and it revives the cost-9 copy", () => {
    const engine = setup();
    const momoId = engine.findCardInZone("south", "character", op16KouzukiMomonosuke084);
    expect(costOf(engine)).toBe(5);

    inflateWithShinobu(engine);
    expect(costOf(engine)).toBe(25);

    engine.activateMain(op16KouzukiMomonosuke084, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const pick = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (pick?.kind !== "selectEntity") throw new Error("Expected the revive prompt.");
    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [pick.candidates[0]!.ref.id] },
      "south",
    );

    // The revived OP16-085 has its own [On Play] revive. Shinobu is in the
    // trash and is {Land of Wano} at cost 2, so it is offered here; OP16-084
    // is excluded by that card's name clause.
    const chained = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (chained?.kind !== "selectEntity") throw new Error("Expected the chained revive prompt.");
    const chainedIds = chained.candidates.map(
      (candidate) => engine.getState().cards[candidate.ref.id]?.cardId,
    );
    expect(chainedIds).toContain(op16Shinobu087.id);
    expect(chainedIds).not.toContain(op16KouzukiMomonosuke084.id);
    engine.resolveDecision("effectPlaySelection", { selectedIds: [] }, "south");

    const view = engine.getView("south");
    // The activating copy paid itself into the trash.
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(momoId);
    // The cost-9 copy came back out of it.
    expect(view.players.south.characters.filter(Boolean).map((card) => card?.cardId)).toContain(
      op16KouzukiMomonosuke085.id,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("at its printed cost of 5 the ability is unavailable", () => {
    const engine = setup();
    const momoId = engine.findCardInZone("south", "character", op16KouzukiMomonosuke084);
    const trashBefore = engine.getView("south").players.south.trash.length;
    expect(costOf(engine)).toBe(5);

    // Without Shinobu's inflation the cardState gate fails.
    expect(() => engine.activateMain(op16KouzukiMomonosuke084, "south")).toThrow();

    const view = engine.getView("south").players.south;
    expect(view.characters.filter(Boolean).map((card) => card?.instanceId)).toContain(momoId);
    expect(view.trash).toHaveLength(trashBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the gate closes again once the +20 expires at the turn boundary", () => {
    const engine = setup();
    inflateWithShinobu(engine);
    expect(costOf(engine)).toBe(25);

    engine.endTurn("south");
    engine.endTurn("north");

    expect(costOf(engine)).toBe(5);
    expect(() => engine.activateMain(op16KouzukiMomonosuke084, "south")).toThrow();
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("declining the optional leaves the board and trash untouched", () => {
    const engine = setup();
    const momoId = engine.findCardInZone("south", "character", op16KouzukiMomonosuke084);
    inflateWithShinobu(engine);
    const trashBefore = engine.getView("south").players.south.trash.length;

    engine.activateMain(op16KouzukiMomonosuke084, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south").players.south;
    expect(view.characters.filter(Boolean).map((card) => card?.instanceId)).toContain(momoId);
    expect(view.trash).toHaveLength(trashBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
