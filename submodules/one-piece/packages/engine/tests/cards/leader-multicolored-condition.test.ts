import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard, LeaderCard } from "@tcg/op-types";
import { eb01KouzukiOden001, op12Fullbody052, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { registerCards } from "../../../cards/src/runtime-catalog.ts";

/**
 * leaderMulticolored.value: backwards-compatible monocolor support.
 *
 * Existing cards write { condition: "leaderMulticolored" } and must keep
 * their exact meaning. `value` defaults to true, so omitting it and writing
 * `value: true` are identical; only `value: false` is new, and it expresses
 * printed text such as OP17-005's "your monocolored Leader".
 *
 *   Leader         omitted   true   false
 *   multicolored     yes      yes     no
 *   monocolored      no       no      yes
 *
 * Each cell is driven through the engine: a synthetic Character whose
 * [On Play] draws a card only when the condition holds.
 */
const gated = (suffix: string, value?: boolean): CharacterCard => ({
  ...op12Fullbody052,
  id: `TEST-LMC-${suffix}`,
  canonicalId: `TEST-LMC-${suffix}`,
  slug: `test-lmc-${suffix.toLowerCase()}`,
  name: `Multicolor Gate ${suffix}`,
  cost: 1,
  effects: {
    effects: [
      {
        trigger: "onPlay",
        conditions: [
          value === undefined
            ? { condition: "leaderMulticolored" }
            : { condition: "leaderMulticolored", value },
        ],
        actions: [{ action: "draw", player: "self", amount: 1 }],
      },
    ],
  },
});

const OMITTED = gated("OMIT");
const TRUE = gated("TRUE", true);
const FALSE = gated("FALSE", false);
registerCards([OMITTED, TRUE, FALSE]);

const drewWith = (leader: LeaderCard, card: CharacterCard): boolean => {
  const engine = OnePieceTestEngine.create(
    {
      leaderCardId: leader,
      hand: [{ card }],
      deck: [op12Fullbody052, op12Fullbody052],
      activeDon: 10,
      life: 3,
    },
    { life: 3 },
    { firstPlayer: "south", activeSeat: "south" },
  );
  const before = engine.getView("south").players.south.deckCount;
  engine.play(card, "south");
  expect(engine.getView("south").prompts).toHaveLength(0);
  return engine.getView("south").players.south.deckCount === before - 1;
};

describe("leaderMulticolored.value", () => {
  test("the fixtures really are multicolored and monocolored", () => {
    expect(eb01KouzukiOden001.color.length).toBeGreaterThan(1);
    expect(op17RocksDXebec039.color).toHaveLength(1);
  });

  test("multicolored Leader: omitted and true match, false does not", () => {
    expect(drewWith(eb01KouzukiOden001, OMITTED)).toBe(true);
    expect(drewWith(eb01KouzukiOden001, TRUE)).toBe(true);
    expect(drewWith(eb01KouzukiOden001, FALSE)).toBe(false);
  });

  test("monocolored Leader: omitted and true do not match, false does", () => {
    expect(drewWith(op17RocksDXebec039, OMITTED)).toBe(false);
    expect(drewWith(op17RocksDXebec039, TRUE)).toBe(false);
    expect(drewWith(op17RocksDXebec039, FALSE)).toBe(true);
  });
});
