import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op12Fullbody052, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { registerCards } from "../../../cards/src/runtime-catalog.ts";

/**
 * Unit coverage for `grantKeyword.triggerEventTarget`.
 *
 * Printed text of the form "when a Character is played, THAT Character gains
 * [X]" must bind the grant to the card that caused the trigger event rather
 * than to a freely chosen Character. This follows the existing
 * action-specific trigger-binding pattern used by `returnToDeck` and
 * `copyPower`; see the type comment for why a generalized event-subject
 * target was deliberately left out of scope.
 */
const rushOnPlaySource: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-TRIGGER-EVENT-TARGET",
  canonicalId: "TEST-TRIGGER-EVENT-TARGET",
  slug: "test-trigger-event-target",
  name: "Test Rush Granter",
  effects: {
    effects: [
      {
        trigger: "whenYouPlayCharacter",
        eventFilter: { player: "self" },
        actions: [
          {
            action: "grantKeyword",
            target: { player: "self", zones: ["character"], count: { amount: "all" } },
            keyword: "rush",
            duration: "thisTurn",
            triggerEventTarget: true,
          },
        ],
      },
    ],
  },
};
registerCards([rushOnPlaySource]);

describe("grantKeyword.triggerEventTarget", () => {
  test("grants only to the triggering Character, and it can attack that turn", () => {
    const engine = OnePieceTestEngine.create(
      {
        character: [
          { card: rushOnPlaySource, playedOnTurn: 0 },
          { card: op12Fullbody052, playedOnTurn: 0 },
        ],
        hand: [{ card: op17Jozu008 }],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const bystanderId = engine.findCardInZone("south", "character", op12Fullbody052);
    const lifeBefore = engine.getView("south").players.north.lifeCount;

    engine.play(op17Jozu008, "south");
    const playedId = engine.findCardInZone("south", "character", op17Jozu008);

    const modifiers = Object.values(engine.getState().modifiers);
    // The triggering Character is bound automatically, with no target prompt.
    expect(modifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: playedId, type: "keyword", keyword: "rush" }),
      ]),
    );
    // The bystander must NOT receive it, which is what distinguishes this from
    // an ordinary "up to 1 of your Characters" grant.
    expect(modifiers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: bystanderId, type: "keyword", keyword: "rush" }),
      ]),
    );

    // Behavioral proof: the Character was played this turn, so only the
    // granted Rush permits this attack.
    engine.declareAttack(playedId, engine.leader("north"), "south");
    expect(engine.getView("south").players.north.lifeCount).toBe(lifeBefore - 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the grant expires at the turn boundary", () => {
    const engine = OnePieceTestEngine.create(
      {
        character: [{ card: rushOnPlaySource, playedOnTurn: 0 }],
        hand: [{ card: op17Jozu008 }],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op17Jozu008, "south");
    const playedId = engine.findCardInZone("south", "character", op17Jozu008);
    expect(Object.values(engine.getState().modifiers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: playedId, type: "keyword", keyword: "rush" }),
      ]),
    );

    engine.endTurn("south");

    expect(Object.values(engine.getState().modifiers)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: playedId, type: "keyword", keyword: "rush" }),
      ]),
    );
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
