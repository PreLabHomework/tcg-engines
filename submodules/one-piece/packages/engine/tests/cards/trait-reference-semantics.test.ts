import { describe, expect, test } from "vite-plus/test";
import type { CharacterCard } from "@tcg/op-types";
import { op12Fullbody052 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { registerCards } from "../../../cards/src/runtime-catalog.ts";

/**
 * Comprehensive Rules 2-4-3 vs 2-4-3-1: braced versus quoted type references.
 *
 *   2-4-3    Some text will include text in { } brackets. This refers to cards
 *            with THE TYPE SPECIFIED in the { } brackets.       -> exact match
 *   2-4-3-1  Some text will include part of a type in " " quotation marks.
 *            This text refers to cards with a type CONTAINING the text in the
 *            quotation marks.                                   -> substring
 *
 * The engine encodes the distinction as TargetFilter.trait with and without
 * `match: "includes"`. This pins both halves so the substring mode is not
 * later "fixed" into exactness, and the exact mode is not loosened.
 *
 * Both subjects below use migrated atomic trait arrays. Roughly 717 upstream
 * cards still store a multi-type line flattened into one string (for example
 * traits: ["Impel Down Former Baroque Works"]), for which exact type matching
 * is not representable at all. Using those here would test the legacy data
 * shape rather than the rule.
 */
const pure: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-TRAIT-PURE",
  canonicalId: "TEST-TRAIT-PURE",
  slug: "test-trait-pure",
  name: "Test Pure Rocks",
  cost: 1,
  traits: ["Rocks Pirates"],
  effects: undefined,
};

const former: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-TRAIT-FORMER",
  canonicalId: "TEST-TRAIT-FORMER",
  slug: "test-trait-former",
  name: "Test Former Rocks",
  cost: 1,
  traits: ["Former Rocks Pirates"],
  effects: undefined,
};

/** Braced {Rocks Pirates}: exact type. */
const bracedSource: CharacterCard = {
  ...op12Fullbody052,
  id: "TEST-TRAIT-BRACED",
  canonicalId: "TEST-TRAIT-BRACED",
  slug: "test-trait-braced",
  name: "Test Braced Source",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [
          {
            action: "play",
            source: { player: "self", zone: "hand" },
            count: { amount: 1, upTo: true },
            filters: [{ filter: "trait", value: "Rocks Pirates" }],
          },
        ],
      },
    ],
  },
};

/** Quoted "Rocks Pirates": any type containing the text. */
const quotedSource: CharacterCard = {
  ...bracedSource,
  id: "TEST-TRAIT-QUOTED",
  canonicalId: "TEST-TRAIT-QUOTED",
  slug: "test-trait-quoted",
  name: "Test Quoted Source",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [
          {
            action: "play",
            source: { player: "self", zone: "hand" },
            count: { amount: 1, upTo: true },
            filters: [{ filter: "trait", value: "Rocks Pirates", match: "includes" }],
          },
        ],
      },
    ],
  },
};
registerCards([pure, former, bracedSource, quotedSource]);

const candidatesFor = (source: CharacterCard) => {
  const engine = OnePieceTestEngine.create(
    {
      hand: [{ card: source }, { card: pure }, { card: former }],
      activeDon: 10,
      life: 3,
    },
    { life: 3 },
    { firstPlayer: "south", activeSeat: "south" },
  );
  engine.play(source, "south");
  const step = engine.pendingDecision("effectPlaySelection", "south").steps[0];
  if (step?.kind !== "selectEntity") throw new Error("Expected a play-selection prompt.");
  return {
    engine,
    cardIds: step.candidates.map((candidate) => engine.getState().cards[candidate.ref.id]?.cardId),
  };
};

describe("trait reference semantics (CR 2-4-3 / 2-4-3-1)", () => {
  test("2-4-3: braced {Rocks Pirates} matches the exact type only", () => {
    const { engine, cardIds } = candidatesFor(bracedSource);
    expect(cardIds).toContain(pure.id);
    // "Former Rocks Pirates" is a different type, so the braced form excludes it.
    expect(cardIds).not.toContain(former.id);
    expect(cardIds).toHaveLength(1);
    engine.resolveDecision("effectPlaySelection", { selectedIds: [] }, "south");
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test('2-4-3-1: quoted "Rocks Pirates" also matches Former Rocks Pirates', () => {
    const { engine, cardIds } = candidatesFor(quotedSource);
    expect(cardIds).toContain(pure.id);
    // The quoted form matches any type CONTAINING the text.
    expect(cardIds).toContain(former.id);
    expect(cardIds).toHaveLength(2);
    engine.resolveDecision("effectPlaySelection", { selectedIds: [] }, "south");
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
