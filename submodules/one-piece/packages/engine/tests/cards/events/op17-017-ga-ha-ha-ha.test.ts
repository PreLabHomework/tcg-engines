import { describe, expect, test } from "vite-plus/test";
import { op02EdwardNewgate001, op12EdwardNewgate002, op17GaHaHaHa017 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-017 Ga Ha Ha Ha!!
 *   [Counter] Up to 1 of your Leader with a type including "Whitebeard
 *   Pirates" or up to 1 of your Characters with a type including "Whitebeard
 *   Pirates" gains +2000 power during this battle. Then, give up to 1 of your
 *   opponent's Leader or Characters -2000 power during this turn.
 *
 * The parser dropped the entire first clause and kept only the debuff, so this
 * proof pins the +2000 buff specifically.
 *
 * Proof pattern notes:
 *  - Counter events resolve inside battleCounter, so the buff is proven by
 *    battle outcome; the debuff persists and is readable afterwards.
 */
describe("OP17-017 Ga Ha Ha Ha!!", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op02EdwardNewgate001,
        hand: [{ card: op17GaHaHaHa017 }],
        // A Counter event still costs DON!! to activate during the counter step.
        activeDon: 2,
        life: 3,
      },
      { character: [{ card: op12EdwardNewgate002, playedOnTurn: 0 }] },
      { firstPlayer: "south", activeSeat: "north" },
    );

  test("the +2000 buff repels an attack the Leader would otherwise lose", () => {
    const engine = setup();
    const attackerId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const eventId = engine.findCardInZone("south", "hand", op17GaHaHaHa017);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    // OP02-001 Edward.Newgate is 6000 and carries {Whitebeard Pirates}; the
    // attacker is 6000, so a tie would connect without the +2000.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleCounter", { selectedIds: [eventId] }, "south");
    engine.resolveDecision(
      "effectTargetSelection",
      { selectedIds: [engine.leader("south")] },
      "south",
    );
    engine.resolveDecision("effectTargetSelection", { selectedIds: [attackerId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore);
    // The debuff lasts the whole turn, so it is still visible after the battle.
    const attacker = view.players.north.characters.find((card) => card?.instanceId === attackerId);
    expect(attacker?.power).toBe(4000);
    expect(view.prompts).toHaveLength(0);
  });

  test("without the Counter event the same attack connects", () => {
    const engine = setup();
    const attackerId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const lifeBefore = engine.getView("south").players.south.lifeCount;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.lifeCount).toBe(lifeBefore - 1);
    expect(
      view.players.north.characters.find((card) => card?.instanceId === attackerId)?.power,
    ).toBe(6000);
  });
});
