import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import {
  op12EdwardNewgate002,
  op12Fullbody052,
  op17Jozu008,
  op17Kaido042,
  op17RocksDXebec039,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";
import { registerCards } from "../../../../cards/src/runtime-catalog.ts";

/**
 * OP17-042 Kaido
 *   [Blocker]
 *   [On Play] You may reveal 3 cards with a type including "Rocks Pirates"
 *   from your hand: Give up to 1 of your opponent's Characters -3000 power
 *   during this turn.
 *
 * Proof pattern notes:
 *  - The reveal is a COST, so it must be shown to gate the effect, not merely
 *    to accompany it. With only two eligible cards the ability is unpayable
 *    and no optional is even offered.
 *  - Revealing does not discard: the three cards stay in hand.
 *  - "Rocks Pirates" is quoted, so CR 2-4-3-1 applies and OP17-045 Kyo
 *    (Rocks Pirates) qualifies while OP17-008 Jozu (Whitebeard) does not.
 */
const rocks = (suffix: string, name: string): CharacterCard => ({
  ...op12Fullbody052,
  id: `TEST-K42-${suffix}`,
  canonicalId: `TEST-K42-${suffix}`,
  slug: `test-k42-${suffix.toLowerCase()}`,
  name,
  cost: 1,
  traits: ["Rocks Pirates"],
  effects: undefined,
});
const R1 = rocks("R1", "Kaido Fodder One");
const R2 = rocks("R2", "Kaido Fodder Two");
const R3 = rocks("R3", "Kaido Fodder Three");
registerCards([R1, R2, R3]);

describe("OP17-042 Kaido", () => {
  const setup = (eligible: CharacterCard[]) =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17Kaido042 }, ...eligible.map((card) => ({ card }))],
        activeDon: 10,
        life: 3,
      },
      { character: [{ card: op12EdwardNewgate002, playedOnTurn: 0 }], life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("revealing 3 Rocks Pirates cards weakens an opponent Character", () => {
    const engine = setup([R1, R2, R3]);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const handBefore = engine.getView("south").players.south.hand.length;
    const trashBefore = engine.getView("south").players.south.trash.length;

    engine.play(op17Kaido042, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");
    engine.resolveDecision("effectTargetSelection", { selectedIds: [victimId] }, "south");

    const view = engine.getView("south");
    // OP12-002 Edward.Newgate is 6000 power; -3000 leaves 3000.
    expect(view.players.north.characters.find((card) => card?.instanceId === victimId)?.power).toBe(
      3000,
    );
    // Revealing is not discarding: the three stay in hand, nothing trashed.
    expect(view.players.south.hand.length).toBe(handBefore - 1);
    expect(view.players.south.trash.length).toBe(trashBefore);
    expect(view.prompts).toHaveLength(0);
  });

  test("with only 2 eligible cards the cost is unpayable and nothing is offered", () => {
    const engine = setup([R1, R2]);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.play(op17Kaido042, "south");

    const view = engine.getView("south");
    expect(view.players.north.characters.find((card) => card?.instanceId === victimId)?.power).toBe(
      6000,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("ineligible cards do not count toward the reveal cost", () => {
    // Two Rocks Pirates plus a Whitebeard Pirates: still only 2 eligible.
    const engine = setup([R1, R2, op17Jozu008 as CharacterCard]);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.play(op17Kaido042, "south");

    const view = engine.getView("south");
    expect(view.players.north.characters.find((card) => card?.instanceId === victimId)?.power).toBe(
      6000,
    );
    expect(view.prompts).toHaveLength(0);
  });

  test("may decline the optional, leaving the opponent untouched", () => {
    const engine = setup([R1, R2, R3]);
    const victimId = engine.findCardInZone("north", "character", op12EdwardNewgate002);

    engine.play(op17Kaido042, "south");
    const before = engine.getView("south").players.south;
    const donPoolBefore = before.activeDon + before.restedDon;
    const donDeckBefore = before.donDeckCount;
    const handBefore = before.hand.length;
    const deckBefore = before.deckCount;
    const trashBefore = before.trash.length;

    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const after = engine.getView("south").players.south;
    expect(after.activeDon + after.restedDon).toBe(donPoolBefore);
    expect(after.donDeckCount).toBe(donDeckBefore);
    expect(after.hand.length).toBe(handBefore);
    expect(after.deckCount).toBe(deckBefore);
    expect(after.trash.length).toBe(trashBefore);
    expect(
      engine.getView("south").players.north.characters.find((c) => c?.instanceId === victimId)
        ?.power,
    ).toBe(6000);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
