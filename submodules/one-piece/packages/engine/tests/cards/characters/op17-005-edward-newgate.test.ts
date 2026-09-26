import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import { op02EdwardNewgate001, op13Sabo004, op17EdwardNewgate005 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-005 Edward.Newgate
 *   If your opponent has a Character with 10000 power or more, give this card
 *   in your hand -4 cost.
 *   [On Play] Your monocolored Leader's base power becomes 8000 until the end
 *   of your opponent's next End Phase.
 *
 * Second independent real-card exercise of the `setBasePower` action, using a
 * different condition shape than OP17-008 Jozu (monocolored Leader rather than
 * a named Leader).
 */
describe("OP17-005 Edward.Newgate", () => {
  const withLeader = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId,
        hand: [{ card: op17EdwardNewgate005 }],
        activeDon: 10,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("sets a monocolored Leader's base power to 8000 on play", () => {
    const engine = withLeader(op02EdwardNewgate001);

    // OP02-001 Edward.Newgate is mono-red with a printed base power of 6000.
    expect(engine.getView("south").players.south.leader.power).toBe(6000);

    engine.play(op17EdwardNewgate005, "south");

    const view = engine.getView("south");
    expect(view.players.south.leader.power).toBe(8000);
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });

  test("does nothing when the Leader is multicolored", () => {
    // OP13-004 Sabo is a black/red Leader, so the monocolored condition fails.
    const engine = withLeader(op13Sabo004);
    const before = engine.getView("south").players.south.leader.power;

    engine.play(op17EdwardNewgate005, "south");

    const view = engine.getView("south");
    expect(view.players.south.leader.power).toBe(before);
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });

  test("the assignment expires rather than persisting indefinitely", () => {
    const engine = withLeader(op02EdwardNewgate001);

    engine.play(op17EdwardNewgate005, "south");
    expect(engine.getView("south").players.south.leader.power).toBe(8000);

    engine.endTurn("south");
    expect(engine.getView("south").players.south.leader.power).toBe(8000);

    engine.endTurn("north");
    expect(engine.getView("south").players.south.leader.power).toBe(6000);
  });
});
