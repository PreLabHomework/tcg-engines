import { describe, expect, test } from "vite-plus/test";
import type { LeaderCard } from "@tcg/op-types";
import {
  op02EdwardNewgate001,
  op03Nami040,
  op17Izo003,
  op17Jozu008,
  op17KouzukiOden007,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP17-007 Kouzuki Oden
 *   [On Play] If your Leader is [Edward.Newgate] or has the {Land of Wano}
 *   type, play up to 1 {Land of Wano} type Character card or Character card
 *   with a type including "Whitebeard Pirates" with 6000 power or less from
 *   your hand.
 *
 * Proof pattern notes:
 *  - Selection: eligibility is trait OR trait, AND power <= 6000.
 *    OP17-003 Izo is 6000 {Land of Wano}/{Whitebeard Pirates} -> eligible.
 *    OP17-008 Jozu is 8000 {Whitebeard Pirates} -> excluded on power.
 */
describe("OP17-007 Kouzuki Oden", () => {
  const setup = (leaderCardId: LeaderCard) =>
    OnePieceTestEngine.create(
      {
        leaderCardId,
        hand: [{ card: op17KouzukiOden007 }, { card: op17Izo003 }, { card: op17Jozu008 }],
        activeDon: 7,
        life: 3,
      },
      {},
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("with an [Edward.Newgate] Leader, puts an eligible Character into play free", () => {
    const engine = setup(op02EdwardNewgate001);
    const izoId = engine.findCardInZone("south", "hand", op17Izo003);
    const jozuId = engine.findCardInZone("south", "hand", op17Jozu008);

    engine.play(op17KouzukiOden007, "south");

    const target = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (target?.kind !== "selectEntity") throw new Error("Expected Oden's play prompt.");
    const candidateIds = target.candidates.map((candidate) => candidate.ref.id);
    expect(candidateIds).toContain(izoId);
    // Jozu carries the right trait but is 8000 power, above the 6000 cap.
    expect(candidateIds).not.toContain(jozuId);
    engine.resolveDecision("effectPlaySelection", { selectedIds: [izoId] }, "south");

    const view = engine.getView("south");
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(2);
    expect(view.players.south.hand).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });

  test("does nothing when the Leader is neither [Edward.Newgate] nor {Land of Wano}", () => {
    const engine = setup(op03Nami040);

    engine.play(op17KouzukiOden007, "south");

    const view = engine.getView("south");
    // Only Oden itself reached the board; the hand is untouched.
    expect(view.players.south.characters.filter(Boolean)).toHaveLength(1);
    expect(view.players.south.hand).toHaveLength(2);
    expect(view.prompts).toHaveLength(0);
  });
});
