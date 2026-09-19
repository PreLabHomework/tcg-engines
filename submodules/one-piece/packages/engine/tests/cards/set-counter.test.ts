import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op12Bastille088, op16PortgasDAce118, op17Jozu008 } from "@tcg/op-cards";
import { registerCards } from "../../../cards/src/runtime-catalog.ts";

import { createTestMatchState } from "../../src/index.ts";
import { getCardCounter } from "../../src/shared.ts";

/**
 * Unit coverage for absolute Counter assignment (`setCounter`).
 *
 * OP16-118 Portgas.D.Ace reads "The counter of all of your Character cards with
 * 8000 power in your hand becomes +2000", which is an assignment rather than
 * the addition performed by `modifyCounter`.
 *
 * The comprehensive rules (v1.2.0) define conflict resolution for base power
 * (4-9-2-1) and base cost (4-9-2-2) but say nothing about Counter values, so
 * colliding assignments with differing values are surfaced as an error instead
 * of being resolved by analogy.
 */

// Synthetic source used only to force a conflicting assignment. It mirrors
// OP16-118's permanent effect with a different value.
const conflictingSource: CharacterCard = {
  ...op16PortgasDAce118,
  id: "TEST-CONFLICT-COUNTER",
  canonicalId: "TEST-CONFLICT-COUNTER",
  slug: "test-conflict-counter",
  name: "Test Conflicting Counter Source",
  effects: {
    permanentEffects: [
      {
        actions: [
          {
            action: "setCounter",
            target: {
              player: "self",
              zones: ["hand"],
              count: { amount: "all" },
              filters: [
                { filter: "cardCategory", value: "character" },
                { filter: "power", comparison: "eq", value: 8000 },
              ],
            },
            value: 3000,
          },
        ],
      },
    ],
  },
};
registerCards([conflictingSource]);

describe("setCounter (absolute Counter assignment)", () => {
  const withSources = (sources: CharacterCard[]) =>
    createTestMatchState(
      {
        character: sources.map((card) => ({ card, playedOnTurn: 0 })),
        hand: [{ card: op17Jozu008 }, { card: op12Bastille088 }],
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("assigns 2000 to an 8000-power card that has no printed Counter", () => {
    const state = withSources([op16PortgasDAce118]);
    const jozuId = state.players.south.hand.find(
      (id) => state.cards[id]?.cardId === op17Jozu008.id,
    )!;

    // OP17-008 Jozu is 8000 power with no printed Counter.
    expect(op17Jozu008.counter ?? 0).toBe(0);
    expect(getCardCounter(state, jozuId)).toBe(2000);
  });

  test("assignment replaces a printed Counter rather than adding to it", () => {
    const state = withSources([op16PortgasDAce118]);
    const bastilleId = state.players.south.hand.find(
      (id) => state.cards[id]?.cardId === op12Bastille088.id,
    )!;

    // OP12-088 Bastille is 8000 power with a printed 1000 Counter. Addition
    // would yield 3000; assignment must yield 2000.
    expect(op12Bastille088.counter).toBe(1000);
    expect(getCardCounter(state, bastilleId)).toBe(2000);
    expect(getCardCounter(state, bastilleId)).not.toBe(3000);
  });

  test("leaves the printed Counter alone with no assigning source in play", () => {
    const state = withSources([]);
    const bastilleId = state.players.south.hand.find(
      (id) => state.cards[id]?.cardId === op12Bastille088.id,
    )!;

    expect(getCardCounter(state, bastilleId)).toBe(1000);
  });

  test("identical simultaneous assignments resolve normally", () => {
    const state = withSources([op16PortgasDAce118, op16PortgasDAce118]);
    const jozuId = state.players.south.hand.find(
      (id) => state.cards[id]?.cardId === op17Jozu008.id,
    )!;

    expect(getCardCounter(state, jozuId)).toBe(2000);
  });

  test("conflicting simultaneous assignments are surfaced, not invented", () => {
    const state = withSources([op16PortgasDAce118, conflictingSource]);
    const jozuId = state.players.south.hand.find(
      (id) => state.cards[id]?.cardId === op17Jozu008.id,
    )!;

    expect(() => getCardCounter(state, jozuId)).toThrow(/Conflicting setCounter/);
  });
});
