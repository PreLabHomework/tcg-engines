import { describe, expect, test } from "vite-plus/test";
import {
  op02EdwardNewgate001,
  op12EdwardNewgate002,
  op16EdwardNewgate003,
  op17Jozu008,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-003 Edward.Newgate
 *   [Your Turn] Your Leader gains [Double Attack] and +2000 power.
 *   [On Play] You may reveal 2 Character cards with 8000 power from your hand:
 *   Give up to 1 of your opponent's Characters -6000 power during this turn.
 *
 * The parser produced the right shape but dropped the revealFromHand cost
 * entirely, which is the omission this proof pins.
 *
 * Proof pattern notes:
 *  - Optional with a cost: effectOptional, then the cost prompt, then targets.
 *  - Continuous [Your Turn] buffs are observable directly on leader.power.
 */
describe("OP16-003 Edward.Newgate", () => {
  const setup = (hand: { card: typeof op17Jozu008 }[]) =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op02EdwardNewgate001,
        hand: [{ card: op16EdwardNewgate003 }, ...hand],
        activeDon: 8,
        life: 3,
      },
      { character: [{ card: op12EdwardNewgate002, playedOnTurn: 0 }] },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("[Your Turn] gives the Leader +2000 power while it is in play", () => {
    const engine = setup([]);
    // OP02-001 Edward.Newgate has a printed base power of 6000.
    expect(engine.getView("south").players.south.leader.power).toBe(6000);

    engine.play(op16EdwardNewgate003, "south");

    expect(engine.getView("south").players.south.leader.power).toBe(8000);
  });

  test("revealing two 8000-power Characters weakens an opponent Character", () => {
    const engine = setup([{ card: op17Jozu008 }, { card: op17Jozu008 }]);
    engine.play(op16EdwardNewgate003, "south");
    // Exactly two eligible 8000-power cards are in hand, so the reveal cost is
    // paid automatically and resolution proceeds straight to targeting.
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const target = engine.pendingDecision("effectTargetSelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected the debuff target prompt.");
    const victimId = target.candidates[0]?.ref.id;
    if (!victimId) throw new Error("Expected an opponent Character candidate.");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [victimId] }, "south");

    const victim = engine
      .getView("south")
      .players.north.characters.find((card) => card?.instanceId === victimId);
    // OP12-002 Edward.Newgate is 6000 power; -6000 takes it to 0.
    expect(victim?.power).toBe(0);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the reveal cost is unpayable with only one 8000-power Character in hand", () => {
    const engine = setup([{ card: op17Jozu008 }]);

    engine.play(op16EdwardNewgate003, "south");

    const view = engine.getView("south");
    // The cost cannot be met, so no optional prompt is offered at all and the
    // opponent Character keeps its printed 6000 power.
    expect(view.prompts).toHaveLength(0);
    expect(view.players.north.characters.filter(Boolean)[0]?.power).toBe(6000);
    expect(view.players.south.hand).toHaveLength(1);
  });

  test("declining the reveal cost leaves the opponent Character untouched", () => {
    const engine = setup([{ card: op17Jozu008 }, { card: op17Jozu008 }]);

    engine.play(op16EdwardNewgate003, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south");
    expect(view.players.north.characters.filter(Boolean)[0]?.power).toBe(6000);
    expect(view.players.south.hand).toHaveLength(2);
    expect(view.prompts).toHaveLength(0);
  });
});
