import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import { op02EdwardNewgate001, op03Nami040, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-008 Jozu
 *   [On Play] Your [Edward.Newgate] Leader's base power becomes 8000 until the
 *   end of your opponent's next End Phase.
 *
 * Vertical slice: OP17 set registration -> card definition -> `setBasePower`
 * action -> real [On Play] execution -> multi-turn duration -> assertions.
 *
 * The published OP-17 Q&A ruling for this card (an existing "set base power to
 * 7000" effect followed by Jozu yields 8000) is consistent with this behavior,
 * but does not by itself distinguish rule 4-9-2-1 highest-wins from
 * last-write-wins, since 8000 exceeds 7000 either way. The discriminating case
 * lives in tests/cards/set-base-power.test.ts.
 */
describe("OP17-008 Jozu", () => {
  const withLeader = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId,
        hand: [{ card: op17Jozu008 }],
        activeDon: 6,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("sets an [Edward.Newgate] Leader's base power to 8000 on play", () => {
    const engine = withLeader(op02EdwardNewgate001);

    // OP02-001 Edward.Newgate has a printed base power of 6000.
    expect(engine.getView("south").players.south.leader.power).toBe(6000);

    engine.play(op17Jozu008, "south");

    const view = engine.getView("south");
    expect(view.players.south.leader.power).toBe(8000);
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });

  test("does nothing when the Leader is not [Edward.Newgate]", () => {
    const engine = withLeader(op03Nami040);
    const before = engine.getView("south").players.south.leader.power;

    engine.play(op17Jozu008, "south");

    const view = engine.getView("south");
    expect(view.players.south.leader.power).toBe(before);
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });

  test("the assignment expires rather than persisting indefinitely", () => {
    const engine = withLeader(op02EdwardNewgate001);

    engine.play(op17Jozu008, "south");
    expect(engine.getView("south").players.south.leader.power).toBe(8000);

    // Survives into the opponent's turn.
    engine.endTurn("south");
    expect(engine.getView("south").players.south.leader.power).toBe(8000);

    // Lapses once the opponent's next End Phase has passed.
    engine.endTurn("north");
    expect(engine.getView("south").players.south.leader.power).toBe(6000);
  });
});
