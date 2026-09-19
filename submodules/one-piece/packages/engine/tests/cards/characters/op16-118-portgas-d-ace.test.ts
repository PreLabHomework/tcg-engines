import { describe, expect, test } from "vite-plus/test";
import { op12Bastille088, op12EdwardNewgate002, op16PortgasDAce118 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-118 Portgas.D.Ace
 *   The counter of all of your Character cards with 8000 power in your hand
 *   becomes +2000.
 *   [On Play]/[On K.O.] Look at 5 cards from the top of your deck; reveal up to
 *   1 [Monkey.D.Luffy] or up to 1 card with a type including "Whitebeard
 *   Pirates" and add it to your hand. Then, place the rest at the bottom of
 *   your deck in any order.
 *
 * The continuous Counter clause was dropped entirely by the parser, which is
 * why this card was flagged by the semantic audit despite a FULL structural
 * parse. Counter values are not projected into the player view, so the clause
 * is proven behaviorally through the counter step.
 *
 * OP12-088 Bastille is 8000 power with a printed 1000 Counter, so addition
 * would grant +3000 during the battle while assignment grants +2000.
 */
describe("OP16-118 Portgas.D.Ace", () => {
  const underAttack = (southCharacters: { card: typeof op16PortgasDAce118 }[]) =>
    OnePieceTestEngine.create(
      {
        character: southCharacters.map((entry) => ({ ...entry, playedOnTurn: 0 })),
        hand: [{ card: op12Bastille088 }],
        life: 3,
      },
      { character: [{ card: op12EdwardNewgate002, playedOnTurn: 0 }] },
      { firstPlayer: "south", activeSeat: "north" },
    );

  test("an 8000-power card in hand counters for 2000, repelling a 6000 attack", () => {
    const engine = underAttack([{ card: op16PortgasDAce118 }]);
    const attackerId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const counterId = engine.findCardInZone("south", "hand", op12Bastille088);
    const lifeBefore = engine.getView("south").players.south.life.length;

    // Leader is 5000 and the attacker is 6000. A 1000 Counter ties at 6000 and
    // the attack still connects; a 2000 Counter reaches 7000 and it fails.
    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleCounter", { selectedIds: [counterId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.life).toHaveLength(lifeBefore);
    expect(view.players.south.hand).toHaveLength(0);
    expect(view.prompts).toHaveLength(0);
  });

  test("without Ace the same card counters for 1000 and the attack connects", () => {
    const engine = underAttack([]);
    const attackerId = engine.findCardInZone("north", "character", op12EdwardNewgate002);
    const counterId = engine.findCardInZone("south", "hand", op12Bastille088);
    const lifeBefore = engine.getView("south").players.south.life.length;

    engine.declareAttack(attackerId, engine.leader("south"), "north");
    engine.resolveDecision("battleCounter", { selectedIds: [counterId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.life).toHaveLength(lifeBefore - 1);
    // The Counter card was spent and the lost Life card replaced it in hand.
    expect(view.players.south.hand).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });
});
