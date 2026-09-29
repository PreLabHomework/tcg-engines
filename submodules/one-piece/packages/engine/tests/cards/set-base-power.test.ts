import { describe, expect, test } from "vite-plus/test";
import { op06Shuraiya009 } from "@tcg/op-cards";

import { createTestMatchState } from "../../src/index.ts";
import { addModifier } from "../../src/state.ts";
import { getCardPower, getSetBasePower } from "../../src/shared.ts";
import type { MatchState } from "../../src/types.ts";

/**
 * Regression coverage for literal base-power assignment (the `setBasePower`
 * action) and its resolution under comprehensive rule 4-9-2-1:
 *
 *   "If there are several effects that set a base power to a certain value,
 *    and those effects all affect the same card, if the values differ, apply
 *    the effect with the highest value."
 *
 * Motivating ruling, OP-17 official Q&A (OP17-008 Jozu): if the base power of
 * the [Edward.Newgate] Leader has already been changed to 7000 by another
 * effect stating "set its base power to 7000", activating Jozu's [On Play]
 * makes the Leader's base power 8000 until the end of the opponent's next
 * End Phase.
 *
 * That ruling alone does not distinguish highest-wins from last-write-wins,
 * since 8000 exceeds 7000 under either reading. The third case below is the
 * discriminating one and follows 4-9-2-1.
 */
describe("setBasePower (literal base-power assignment)", () => {
  const setup = () => {
    const state = createTestMatchState(
      { character: [{ card: op06Shuraiya009, playedOnTurn: 0 }] },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );
    return { state, leaderId: state.players.south.leaderInstanceId };
  };

  const setBase = (state: MatchState, targetId: string, value: number) => {
    addModifier(state, null, targetId, {
      type: "basePower",
      value,
      duration: "untilEndOfOpponentNextEndPhase",
      expiresAtTurn: state.turnNumber + 1,
      expiresAtBattleId: null,
      expiresOnTurnStartOfSeat: null,
    });
  };

  test("a single literal assignment overrides the printed base power", () => {
    const { state, leaderId } = setup();
    const printed = getCardPower(state, leaderId);

    setBase(state, leaderId, 8000);

    expect(getSetBasePower(state, leaderId)).toBe(8000);
    expect(getCardPower(state, leaderId)).toBe(8000);
    expect(printed).not.toBe(8000);
  });

  test("OP17 Q&A: an existing 7000 set is raised to 8000 by a later 8000 set", () => {
    const { state, leaderId } = setup();

    setBase(state, leaderId, 7000);
    expect(getCardPower(state, leaderId)).toBe(7000);

    setBase(state, leaderId, 8000);

    expect(getSetBasePower(state, leaderId)).toBe(8000);
    expect(getCardPower(state, leaderId)).toBe(8000);
  });

  test("4-9-2-1: a later lower set does not win; the highest value applies", () => {
    const { state, leaderId } = setup();

    setBase(state, leaderId, 9000);
    setBase(state, leaderId, 8000);

    // Last-write-wins would yield 8000 here. The rule requires 9000.
    expect(getSetBasePower(state, leaderId)).toBe(9000);
    expect(getCardPower(state, leaderId)).toBe(9000);
  });

  test("attached DON!! and additive modifiers stack on the resolved base", () => {
    const { state, leaderId } = setup();

    setBase(state, leaderId, 8000);
    addModifier(state, null, leaderId, {
      type: "power",
      value: 1000,
      duration: "thisTurn",
      expiresAtTurn: state.turnNumber,
      expiresAtBattleId: null,
      expiresOnTurnStartOfSeat: null,
    });

    expect(getSetBasePower(state, leaderId)).toBe(8000);
    expect(getCardPower(state, leaderId)).toBe(9000);
  });
});
