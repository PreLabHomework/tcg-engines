import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op12Fullbody052 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { registerCards } from "../../../cards/src/runtime-catalog.ts";

/**
 * Shared-battle regression for [When Attacking] dispatch.
 *
 * An attack enqueues the attacker's own whenAttacking effects directly, and
 * separately fans the same event out to other friendly in-play cards so they
 * can observe it through event filters (OP17-040 watches its own Leader
 * attacking). The attacker is excluded from that listener scan.
 *
 * The critical guard here is case 1: without the exclusion, every legacy
 * [When Attacking] card would fire twice.
 */
const ATTACKER_DRAW = 1;
const LISTENER_DRAW = 2;

/** Ordinary attacker with its own [When Attacking]: must fire exactly once. */
const selfAttacker: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-WA-SELF",
  canonicalId: "TEST-WA-SELF",
  slug: "test-wa-self",
  name: "Test Self Attacker",
  power: 6000,
  effects: {
    effects: [
      {
        trigger: "whenAttacking",
        actions: [{ action: "draw", player: "self", amount: ATTACKER_DRAW }],
      },
    ],
  },
};

/** Bystander that observes only a LEADER attacking. */
const leaderListener: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-WA-LISTENER",
  canonicalId: "TEST-WA-LISTENER",
  slug: "test-wa-listener",
  name: "Test Leader Listener",
  effects: {
    effects: [
      {
        trigger: "whenFriendlyCardAttacks",
        // filters match event.instanceId (the attacker). sourceFilters read
        // event.sourceInstanceId, which an attack event does not populate.
        eventFilter: { filters: [{ filter: "cardCategory", value: "leader" }] },
        actions: [{ action: "draw", player: "self", amount: LISTENER_DRAW }],
      },
    ],
  },
};

/** Observer with no event filter: any friendly attack. */
const openObserver: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-WA-OPEN",
  canonicalId: "TEST-WA-OPEN",
  slug: "test-wa-open",
  name: "Test Open Observer",
  effects: {
    effects: [
      {
        trigger: "whenFriendlyCardAttacks",
        actions: [{ action: "draw", player: "self", amount: 1 }],
      },
    ],
  },
};

/** Defender-side listener, to confirm the existing path is untouched. */
const defenderListener: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-WA-DEFENDER",
  canonicalId: "TEST-WA-DEFENDER",
  slug: "test-wa-defender",
  name: "Test Defender Listener",
  effects: {
    effects: [
      {
        trigger: "onOpponentAttack",
        actions: [{ action: "draw", player: "self", amount: 1 }],
      },
    ],
  },
};
registerCards([selfAttacker, leaderListener, openObserver, defenderListener]);

const deck = Array.from({ length: 12 }, () => op12Fullbody052);

describe("[When Attacking] dispatch", () => {
  test("an attacker's own [When Attacking] fires exactly once", () => {
    const engine = OnePieceTestEngine.create(
      { character: [{ card: selfAttacker, playedOnTurn: 0 }], deck, life: 3 },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const attackerId = engine.findCardInZone("south", "character", selfAttacker);
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.declareAttack(attackerId, engine.leader("north"), "south");

    // Exactly ONE draw. Two would mean the listener scan re-enqueued it.
    expect(engine.getView("south").players.south.deckCount).toBe(deckBefore - ATTACKER_DRAW);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("a bare [When Attacking] bystander does NOT fire when another card attacks", () => {
    const engine = OnePieceTestEngine.create(
      { character: [{ card: selfAttacker, playedOnTurn: 0 }], deck, life: 3 },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const deckBefore = engine.getView("south").players.south.deckCount;

    // The LEADER attacks, so the bystander is not the attacker. Its printed
    // text means "when THIS card attacks" and must stay silent.
    engine.declareAttack(engine.leader("south"), engine.leader("north"), "south");

    expect(engine.getView("south").players.south.deckCount).toBe(deckBefore);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("an unfiltered whenFriendlyCardAttacks observer fires on a friendly attack", () => {
    const engine = OnePieceTestEngine.create(
      {
        character: [
          { card: openObserver, playedOnTurn: 0 },
          { card: selfAttacker, playedOnTurn: 0 },
        ],
        deck,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const attackerId = engine.findCardInZone("south", "character", selfAttacker);
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.declareAttack(attackerId, engine.leader("north"), "south");

    // Attacker's own draw plus the observer's.
    expect(engine.getView("south").players.south.deckCount).toBe(deckBefore - ATTACKER_DRAW - 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("a friendly bystander observes the Leader attacking", () => {
    const engine = OnePieceTestEngine.create(
      { character: [{ card: leaderListener, playedOnTurn: 0 }], deck, life: 3 },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.declareAttack(engine.leader("south"), engine.leader("north"), "south");

    expect(engine.getView("south").players.south.deckCount).toBe(deckBefore - LISTENER_DRAW);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the same bystander ignores a Character attacking", () => {
    const engine = OnePieceTestEngine.create(
      {
        character: [
          { card: leaderListener, playedOnTurn: 0 },
          { card: selfAttacker, playedOnTurn: 0 },
        ],
        deck,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const attackerId = engine.findCardInZone("south", "character", selfAttacker);
    const deckBefore = engine.getView("south").players.south.deckCount;

    engine.declareAttack(attackerId, engine.leader("north"), "south");

    // Only the attacker's own draw: the sourceFilter rejects a Character.
    expect(engine.getView("south").players.south.deckCount).toBe(deckBefore - ATTACKER_DRAW);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("the defending side's onOpponentAttack listener still fires", () => {
    const engine = OnePieceTestEngine.create(
      { character: [{ card: selfAttacker, playedOnTurn: 0 }], deck, life: 3 },
      { character: [{ card: defenderListener, playedOnTurn: 0 }], deck, life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const attackerId = engine.findCardInZone("south", "character", selfAttacker);
    const northDeckBefore = engine.getView("north").players.north.deckCount;

    engine.declareAttack(attackerId, engine.leader("north"), "south");
    // The defender drew, so it now has a hand and reaches the counter step.
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "north");

    expect(engine.getView("north").players.north.deckCount).toBe(northDeckBefore - 1);
    expect(engine.getView("north").prompts).toHaveLength(0);
  });

  test("attacker, friendly listener and defender listener all resolve without duplicates", () => {
    const engine = OnePieceTestEngine.create(
      {
        character: [
          { card: selfAttacker, playedOnTurn: 0 },
          { card: leaderListener, playedOnTurn: 0 },
        ],
        deck,
        life: 3,
      },
      { character: [{ card: defenderListener, playedOnTurn: 0 }], deck, life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );
    const southDeckBefore = engine.getView("south").players.south.deckCount;
    const northDeckBefore = engine.getView("north").players.north.deckCount;

    // The LEADER attacks, so selfAttacker is NOT the attacker: its bare
    // [When Attacking] must stay silent while the leader listener fires.
    engine.declareAttack(engine.leader("south"), engine.leader("north"), "south");
    // The defender's listener drew it a card, so it now reaches the counter step.
    engine.resolveDecision("battleCounter", { selectedIds: [] }, "north");

    expect(engine.getView("south").players.south.deckCount).toBe(southDeckBefore - LISTENER_DRAW);
    expect(engine.getView("north").players.north.deckCount).toBe(northDeckBefore - 1);
    expect(engine.getView("south").prompts).toHaveLength(0);
    expect(engine.getView("north").prompts).toHaveLength(0);
  });
});
