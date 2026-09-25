import { describe, expect, test } from "vite-plus/test";
import {
  op16MonkeyDLuffy095,
  op16Yamato079,
  op16Yamato096,
  op16Yamato097,
  op16Yamato098,
  op17Jozu008,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-096 / OP16-097 / OP16-098 Yamato — the trash-recursion cluster.
 *
 *   OP16-096 (8/8000) [Unblockable] [On K.O.] Play up to 1 [Yamato] with a
 *     cost of 6 or less from your trash.
 *   OP16-097 (8/8000) [On Play] Add up to 1 {Land of Wano} Character with a
 *     cost of 6 or less from your trash to your hand. Then, play up to 1
 *     Character with a cost of 2 or less from your hand.
 *   OP16-098 (6/5000) [On Play] Draw 1 and trash 1 from hand.
 *     [Activate: Main] You may trash this Character: Play up to 1 black
 *     [Yamato] with a cost of 8 from your trash.
 *
 * 096 and 098 revive each other, so they are proven as a graph rather than in
 * isolation. Every path also runs under the OP16-079 Yamato Leader, whose
 * "played from trash" trigger exercises grantKeyword.triggerEventTarget.
 */
const hasRush = (engine: OnePieceTestEngine, instanceId: string) =>
  Object.values(engine.getState().modifiers).some(
    (modifier) =>
      modifier.targetId === instanceId &&
      modifier.type === "keyword" &&
      modifier.keyword === "rush",
  );

describe("OP16 Yamato trash recursion", () => {
  test("096 [On K.O.] revives 098 from trash, and the Leader grants it [Rush]", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [{ card: op16Yamato096, rested: true, playedOnTurn: 0 }],
        trash: [{ card: op16Yamato098 }],
        activeDon: 10,
        life: 3,
      },
      // OP17-008 Jozu is 8000. Attacks connect on greater-or-equal, so an
      // 8000 attacker K.O.s the 8000 Yamato.
      { character: [{ card: op17Jozu008, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "north" },
    );
    const yamato096Id = engine.findCardInZone("south", "character", op16Yamato096);
    const attackerId = engine.findCardInZone("north", "character", op17Jozu008);

    // South has no hand, so the counter step auto-passes.
    engine.declareAttack(attackerId, yamato096Id, "north");

    const pick = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (pick?.kind !== "selectEntity") throw new Error("Expected the [On K.O.] revive prompt.");
    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [pick.candidates[0]!.ref.id] },
      "south",
    );

    const view = engine.getView("south");
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(yamato096Id);
    const revivedId = engine.findCardInZone("south", "character", op16Yamato098);
    expect(revivedId).toBeTruthy();
    // OP16-079: a {Land of Wano} Character played from trash gains [Rush].
    expect(hasRush(engine, revivedId)).toBe(true);
    expect(view.prompts).toHaveLength(0);
  });

  test("098 [Activate: Main] trashes itself to revive the cost-8 096 from trash", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [{ card: op16Yamato098, playedOnTurn: 0 }],
        trash: [{ card: op16Yamato096 }],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const yamato098Id = engine.findCardInZone("south", "character", op16Yamato098);

    engine.activateMain(op16Yamato098, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    const pick = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (pick?.kind !== "selectEntity") throw new Error("Expected the revive prompt.");
    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [pick.candidates[0]!.ref.id] },
      "south",
    );

    const view = engine.getView("south");
    // 098 paid itself into the trash; 096 came back out of it.
    expect(view.players.south.trash.map((card) => card.instanceId)).toContain(yamato098Id);
    const revivedId = engine.findCardInZone("south", "character", op16Yamato096);
    expect(revivedId).toBeTruthy();
    // OP16-079: a {Land of Wano} Character played from trash gains [Rush].
    expect(hasRush(engine, revivedId)).toBe(true);
    expect(view.prompts).toHaveLength(0);
  });

  test("declining 098's [Activate: Main] keeps it on the board", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        character: [{ card: op16Yamato098, playedOnTurn: 0 }],
        trash: [{ card: op16Yamato096 }],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const yamato098Id = engine.findCardInZone("south", "character", op16Yamato098);
    const trashBefore = engine.getView("south").players.south.trash.length;

    engine.activateMain(op16Yamato098, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south").players.south;
    // Nothing paid: 098 stays out and 096 stays in the trash.
    expect(view.characters.filter(Boolean).map((card) => card?.instanceId)).toContain(yamato098Id);
    expect(view.trash).toHaveLength(trashBefore);
    expect(view.trash.map((card) => card.cardId)).toContain(op16Yamato096.id);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("098 [On Play] draws one and discards one", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        hand: [{ card: op16Yamato098 }, { card: op17Jozu008 }],
        deck: [op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const handBefore = engine.getView("south").players.south.hand.length;

    engine.play(op16Yamato098, "south");
    const discard = engine.pendingDecision("effectTrashFromHandSelection", "south").steps[0];
    if (discard?.kind !== "selectEntity") throw new Error("Expected the discard prompt.");
    engine.resolveDecision(
      "effectTrashFromHandSelection",
      { selectedIds: [discard.candidates[0]!.ref.id] },
      "south",
    );

    const view = engine.getView("south");
    // Played one, drew one, trashed one: net one fewer in hand.
    expect(view.players.south.hand).toHaveLength(handBefore - 1);
    expect(view.prompts).toHaveLength(0);
  });

  test("097 [On Play] recovers 098 from trash to hand, then plays a cost-2 card", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        hand: [{ card: op16Yamato097 }, { card: op16MonkeyDLuffy095 }],
        trash: [{ card: op16Yamato098 }],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op16Yamato097, "south");

    // Clause 1: trash -> hand.
    const recover = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (recover?.kind !== "selectEntity") throw new Error("Expected the trash-to-hand prompt.");
    expect(recover.candidates).toHaveLength(1);
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [recover.candidates[0]!.ref.id] },
      "south",
    );

    // Clause 2: play a cost-2 or less Character from hand. OP16-098 is cost 6
    // and was just recovered, so it must NOT be eligible here.
    const playStep = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (playStep?.kind !== "selectEntity") throw new Error("Expected the hand-play prompt.");
    const eligible = playStep.candidates.map(
      (candidate) => engine.getState().cards[candidate.ref.id]?.cardId,
    );
    expect(eligible).toContain(op16MonkeyDLuffy095.id);
    expect(eligible).not.toContain(op16Yamato098.id);
    engine.resolveDecision(
      "effectPlaySelection",
      { selectedIds: [playStep.candidates[0]!.ref.id] },
      "south",
    );

    // OP16-095's own [On Play] resolves next.
    const grant = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (grant?.kind !== "selectEntity") throw new Error("Expected Luffy's Unblockable prompt.");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand.map((card) => card.cardId)).toContain(op16Yamato098.id);
    const board = view.players.south.characters.filter(Boolean).map((card) => card?.cardId);
    expect(board).toContain(op16Yamato097.id);
    expect(board).toContain(op16MonkeyDLuffy095.id);
    expect(view.prompts).toHaveLength(0);
  });
});
