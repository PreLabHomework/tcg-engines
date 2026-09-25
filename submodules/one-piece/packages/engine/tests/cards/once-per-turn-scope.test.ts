import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op12Fullbody052 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { registerCards } from "../../../cards/src/runtime-catalog.ts";

/**
 * CR 10-2-13 [Once Per Turn].
 *
 *   10-2-13-1  "[Once Per Turn] is a keyword indicating an effect can only be
 *               activated and resolved once during that turn."
 *   10-2-13-2  Multiple cards with the same effect each get their own use.
 *   10-2-13-4  A card that leaves and re-enters the field is a different card
 *               and may use the effect again.
 *
 * "That turn" is a game turn. Your turn and your opponent's turn are two
 * separate turns, so an effect used on your turn must be usable again on the
 * opponent's following turn, and vice versa. These are behavioural tests:
 * they drive real commands and count draws rather than inspecting the
 * engine's once-per-turn bookkeeping directly.
 */
const SHARED = "test-opt:shared";

/** One printed OPT ability under two triggers that fire on opposite turns. */
const both: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-OPT-BOTH",
  canonicalId: "TEST-OPT-BOTH",
  slug: "test-opt-both",
  name: "Test OPT Both",
  effects: {
    effects: [
      {
        trigger: "activateMain",
        actions: [{ action: "draw", player: "self", amount: 1 }],
        oncePerTurn: true,
        oncePerTurnKey: SHARED,
      },
      {
        trigger: "onOpponentAttack",
        actions: [{ action: "draw", player: "self", amount: 1 }],
        oncePerTurn: true,
        oncePerTurnKey: SHARED,
      },
    ],
  },
};

/** A plain OPT activate, for same-turn and multiple-copy cases. */
const activator: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-OPT-ACT",
  canonicalId: "TEST-OPT-ACT",
  slug: "test-opt-act",
  name: "Test OPT Activator",
  effects: {
    effects: [
      {
        trigger: "activateMain",
        actions: [{ action: "draw", player: "self", amount: 1 }],
        oncePerTurn: true,
      },
    ],
  },
};
registerCards([both, activator]);

const deck = Array.from({ length: 20 }, () => op12Fullbody052);
const deckOf = (engine: OnePieceTestEngine) => engine.getView("south").players.south.deckCount;

describe("[Once Per Turn] is scoped to a game turn (CR 10-2-13)", () => {
  test("used on your turn, it is usable again on the opponent's following turn", () => {
    const engine = OnePieceTestEngine.create(
      { character: [{ card: both, playedOnTurn: 0 }], deck, life: 3 },
      { deck, life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    const beforeOwn = deckOf(engine);
    engine.activateMain(both, "south");
    expect(deckOf(engine)).toBe(beforeOwn - 1);

    engine.endTurn();
    expect(engine.getState().activeSeat).toBe("north");

    // A new game turn: the same OPT ability fires again on the other trigger.
    const beforeOpp = deckOf(engine);
    engine.declareAttack(engine.leader("north"), engine.leader("south"), "north");
    expect(deckOf(engine)).toBe(beforeOpp - 1);
  });

  test("used on the opponent's turn, it is usable again on your following turn", () => {
    const engine = OnePieceTestEngine.create(
      { character: [{ card: both, playedOnTurn: 0 }], deck, life: 3 },
      { deck, life: 3 },
      { firstPlayer: "north", activeSeat: "north" },
    );

    const beforeOpp = deckOf(engine);
    engine.declareAttack(engine.leader("north"), engine.leader("south"), "north");
    expect(deckOf(engine)).toBe(beforeOpp - 1);
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "south");

    engine.endTurn();
    expect(engine.getState().activeSeat).toBe("south");

    const beforeOwn = deckOf(engine);
    engine.activateMain(both, "south");
    expect(deckOf(engine)).toBe(beforeOwn - 1);
  });

  test("it still cannot resolve twice within a single turn", () => {
    const engine = OnePieceTestEngine.create(
      { character: [{ card: activator, playedOnTurn: 0 }], deck, life: 3 },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

    const before = deckOf(engine);
    engine.activateMain(activator, "south");
    expect(deckOf(engine)).toBe(before - 1);

    // The second attempt in the same turn is refused and draws nothing.
    expect(() => engine.activateMain(activator, "south")).toThrow();
    expect(deckOf(engine)).toBe(before - 1);
  });

  test("CR 10-2-13-2: separate copies each get their own use", () => {
    const engine = OnePieceTestEngine.create(
      {
        character: [
          { card: activator, playedOnTurn: 0 },
          { card: activator, playedOnTurn: 0 },
        ],
        deck,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const ids = engine
      .getView("south")
      .players.south.characters.filter(Boolean)
      .map((card) => card!.instanceId);
    expect(ids).toHaveLength(2);

    const before = deckOf(engine);
    engine.activateMain(ids[0]!, "south");
    engine.activateMain(ids[1]!, "south");
    // Using one copy does not consume the other's once-per-turn.
    expect(deckOf(engine)).toBe(before - 2);
  });
});
