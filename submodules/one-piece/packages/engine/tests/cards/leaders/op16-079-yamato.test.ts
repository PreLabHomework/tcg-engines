import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op12Fullbody052, op16Yamato079, op17Izo003, op17Jozu008 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";
import { registerCards } from "../../../../cards/src/runtime-catalog.ts";

/**
 * OP16-079 Yamato (Leader)
 *   When a {Land of Wano} type Character card is played from your trash, that
 *   Character gains [Rush] during this turn.
 *
 * Proof pattern notes:
 *  - Needs grantKeyword.triggerEventTarget: the grant binds to the Character
 *    that caused the trigger, not to a chosen target.
 *  - Three independent qualifications are checked separately: source zone
 *    (trash, not hand), trait ({Land of Wano}), and duration (this turn).
 *  - OP17-003 Izo carries {Land of Wano}; OP17-008 Jozu does not.
 */

/** Minimal enabler so the test controls exactly what is played from trash. */
const trashPlayer: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-PLAY-FROM-TRASH",
  canonicalId: "TEST-PLAY-FROM-TRASH",
  slug: "test-play-from-trash",
  name: "Test Trash Player",
  effects: {
    effects: [
      {
        trigger: "activateMain",
        actions: [
          {
            action: "play",
            source: { player: "self", zone: "trash" },
            count: { amount: 1, upTo: true },
            filters: [{ filter: "cardCategory", value: "character" }],
          },
        ],
      },
    ],
  },
};
registerCards([trashPlayer]);

const setup = (trash: CharacterCard[]) =>
  OnePieceTestEngine.create(
    {
      leaderCardId: op16Yamato079,
      character: [{ card: trashPlayer, playedOnTurn: 0 }],
      trash: trash.map((card) => ({ card })),
      activeDon: 10,
      life: 3,
    },
    { life: 3 },
    { firstPlayer: "south", activeSeat: "south" },
  );

const playFromTrash = (engine: ReturnType<typeof setup>, card: CharacterCard) => {
  engine.activateMain(trashPlayer, "south");
  const pick = engine.pendingDecision("effectPlaySelection", "south").steps[0];
  if (pick?.kind !== "selectEntity") throw new Error("Expected a play-from-trash prompt.");
  const id = pick.candidates.find(
    (candidate) => engine.getState().cards[candidate.ref.id]?.cardId === card.id,
  )?.ref.id;
  if (!id) throw new Error(`Expected ${card.id} among trash candidates.`);
  engine.resolveDecision("effectPlaySelection", { selectedIds: [id] }, "south");
  return id;
};

const hasRush = (engine: ReturnType<typeof setup>, instanceId: string) =>
  Object.values(engine.getState().modifiers).some(
    (modifier) =>
      modifier.targetId === instanceId &&
      modifier.type === "keyword" &&
      modifier.keyword === "rush",
  );

describe("OP16-079 Yamato", () => {
  test("has 5000 power and 5 Life", () => {
    expect(op16Yamato079.power).toBe(5000);
    expect(op16Yamato079.life).toBe(5);
  });

  test("a {Land of Wano} Character played from trash gains [Rush] and can attack", () => {
    const engine = setup([op17Izo003]);
    const lifeBefore = engine.getView("south").players.north.lifeCount;

    const izoId = playFromTrash(engine, op17Izo003);

    expect(hasRush(engine, izoId)).toBe(true);
    // Played this turn, so only the granted Rush permits this attack.
    engine.declareAttack(izoId, engine.leader("north"), "south");
    expect(engine.getView("south").players.north.lifeCount).toBe(lifeBefore - 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("a {Land of Wano} Character played from HAND gains nothing", () => {
    const engine = OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        hand: [{ card: op17Izo003 }],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    engine.play(op17Izo003, "south");
    const izoId = engine.findCardInZone("south", "character", op17Izo003);

    // The zone qualification excludes hand plays.
    expect(hasRush(engine, izoId)).toBe(false);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("a non-{Land of Wano} Character played from trash gains nothing", () => {
    const engine = setup([op17Jozu008]);

    const jozuId = playFromTrash(engine, op17Jozu008);

    // OP17-008 Jozu is {Whitebeard Pirates} only.
    expect(hasRush(engine, jozuId)).toBe(false);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the granted [Rush] expires at the turn boundary", () => {
    const engine = setup([op17Izo003]);
    const izoId = playFromTrash(engine, op17Izo003);
    expect(hasRush(engine, izoId)).toBe(true);

    engine.endTurn("south");

    expect(hasRush(engine, izoId)).toBe(false);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
