import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import { op02EdwardNewgate001, op03Nami040, op16MobyDick021, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-021 Moby Dick (Stage)
 *   [On Play] If your Leader has the {Whitebeard Pirates} type, look at 3 cards
 *   from the top of your deck and add up to 1 card to your hand. Then, place
 *   the rest at the bottom of your deck in any order.
 *   [Activate: Main] You may trash this Stage: Give up to 1 rested DON!! card
 *   to your Leader or 1 of your Characters.
 *
 * Proof pattern notes:
 *  - Stage cards occupy their own zone; trashThisCard removes them from it.
 *  - The On Play search has no reveal filter, so every looked-at card is legal.
 *  - Search resolves in TWO steps: effectSearchSelection, then
 *    effectSearchRemainderOrder. Leaving the second unresolved blocks every
 *    later command, including activateMain.
 */
describe("OP16-021 Moby Dick", () => {
  const setup = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId,
        hand: [{ card: op16MobyDick021 }],
        deck: [op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 3,
        life: 3,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );

  /** Plays the Stage and fully resolves its [On Play] search. */
  const playAndResolveSearch = (engine: ReturnType<typeof setup>) => {
    engine.play(op16MobyDick021, "south");
    const search = engine.pendingDecision("effectSearchSelection", "south").steps[0];
    if (search?.kind !== "selectEntity") throw new Error("Expected Moby Dick's search.");
    const candidateIds = search.candidates.map((candidate) => candidate.ref.id);
    engine.resolveDecision("effectSearchSelection", { selectedIds: [candidateIds[0]!] }, "south");
    engine.resolveDecision(
      "effectSearchRemainderOrder",
      { selectedIds: candidateIds.slice(1) },
      "south",
    );
    return candidateIds[0]!;
  };

  test("with a {Whitebeard Pirates} Leader, looks at 3 and adds 1 to hand", () => {
    const engine = setup(op02EdwardNewgate001);
    const pickedId = playAndResolveSearch(engine);

    const view = engine.getView("south");
    expect(view.players.south.hand.map((card) => card.instanceId)).toContain(pickedId);
    expect(view.players.south.stage?.cardId).toBe(op16MobyDick021.id);
    expect(view.prompts).toHaveLength(0);
  });

  test("[Activate: Main] trashes the Stage and attaches a rested DON!!", () => {
    const engine = setup(op02EdwardNewgate001);
    playAndResolveSearch(engine);

    const before = engine.getView("south").players.south;
    // Paying the Stage's 1 cost rested one DON!!, so one is available to give.
    expect(before.stage?.cardId).toBe(op16MobyDick021.id);
    expect(before.restedDon).toBeGreaterThan(0);
    const donBefore = before.leader.attachedDon ?? 0;
    const restedBefore = before.restedDon;

    engine.activateMain(op16MobyDick021, "south");
    // "You may trash this Stage" is optional, so it confirms before paying.
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    // "up to 1" then asks how many to give before choosing the recipient.
    engine.resolveDecision("effectGiveDonCount", { optionId: "1" }, "south");

    const after = engine.getView("south").players.south;
    // The Stage paid for itself and left the field.
    expect(after.stage).toBeFalsy();
    expect(after.trash.map((card) => card.cardId)).toContain(op16MobyDick021.id);
    // A rested DON!! moved from the cost area onto the Leader.
    expect(after.leader.attachedDon).toBe(donBefore + 1);
    expect(after.restedDon).toBe(restedBefore - 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("declining [Activate: Main] keeps the Stage and gives no DON!!", () => {
    const engine = setup(op02EdwardNewgate001);
    playAndResolveSearch(engine);

    const before = engine.getView("south").players.south;
    const donBefore = before.leader.attachedDon ?? 0;
    const restedBefore = before.restedDon;

    engine.activateMain(op16MobyDick021, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    // Nothing paid, nothing gained: the Stage survives on the field.
    expect(after.stage?.cardId).toBe(op16MobyDick021.id);
    expect(after.trash.map((card) => card.cardId)).not.toContain(op16MobyDick021.id);
    expect(after.leader.attachedDon ?? 0).toBe(donBefore);
    expect(after.restedDon).toBe(restedBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("does nothing on play when the Leader lacks {Whitebeard Pirates}", () => {
    const engine = setup(op03Nami040);

    engine.play(op16MobyDick021, "south");

    const view = engine.getView("south");
    expect(view.players.south.hand).toHaveLength(0);
    expect(view.players.south.stage?.cardId).toBe(op16MobyDick021.id);
    expect(view.prompts).toHaveLength(0);
  });
});
