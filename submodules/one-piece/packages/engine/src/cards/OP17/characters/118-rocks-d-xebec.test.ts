import { describe, expect, test } from "vite-plus/test";
import { op17RocksDXebec118 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../index.ts";

/**
 * OP17-118 plays "up to 2 {Rocks Pirates} type cards". The type is written in
 * braces, which CR 2-4-3 defines as the exact type specified. CR 2-4-3-1 gives
 * quoted text ("...") the different meaning of a type CONTAINING that text.
 * So "Former Rocks Pirates" cards, a distinct type, are not eligible here.
 *
 * Bandai's OP17 FAQ uses the same distinction within this set: OP17-039
 * checks for a type including "Rocks Pirates", while OP17-118 refers to the
 * {Rocks Pirates} type.
 *
 * These cases therefore use cards whose type is exactly Rocks Pirates:
 * OP17-045 Kyo (cost 2), OP17-054 Miss Buckingham Stussy (cost 3) and
 * OP17-048 Shiki (cost 7). OP08-051 Buckin (Former Rocks Pirates) is included
 * only to check that it is not offered.
 */
describe("OP17-118 Rocks.D.Xebec", () => {
  test("draws 1 and replays {Rocks Pirates} Characters within a total cost of 9", () => {
    const engine = OnePieceTestEngine.create(
      {
        hand: [op17RocksDXebec118, "OP17-054", "OP17-048", "OP08-051"],
        deck: ["OP16-096", "OP16-095"],
        activeDon: op17RocksDXebec118.cost,
      },
      {},
    );
    const stussyId = engine.findCardInZone("south", "hand", "OP17-054");
    const shikiId = engine.findCardInZone("south", "hand", "OP17-048");
    const buckinId = engine.findCardInZone("south", "hand", "OP08-051");

    engine.playCard(op17RocksDXebec118, "south");
    // Draw 1 happened as part of the On Play.
    expect(engine.getView("south").players.south.hand.length).toBeGreaterThanOrEqual(2);

    const play = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (play?.kind !== "selectEntity") throw new Error("Expected the replay choice.");
    const candidates = play.candidates.map((candidate) => candidate.ref.id);
    expect(candidates).toContain(stussyId);
    expect(candidates).toContain(shikiId);
    // Former Rocks Pirates is a different type from {Rocks Pirates}.
    expect(candidates).not.toContain(buckinId);
    // Shiki alone (7) fits, but pairing her with Stussy (3) would total 10 and
    // blow the cap of 9, so the replay takes only Stussy.
    engine.resolveDecision("effectPlaySelection", { selectedIds: [stussyId] }, "south");

    const view = engine.getView("south").players.south;
    expect(view.characters.map((card) => card?.instanceId)).toContain(stussyId);
    expect(view.hand.map((card) => card.cardId)).toContain("OP17-048");
    expect(engine.getView("south").prompts).toHaveLength(0);
  });

  test("a pair within the total cost replays both Rocks cards", () => {
    const engine = OnePieceTestEngine.create(
      {
        hand: [op17RocksDXebec118, "OP17-054", "OP17-045"],
        deck: ["OP16-096", "OP16-095"],
        activeDon: op17RocksDXebec118.cost,
      },
      {},
    );
    const stussyId = engine.findCardInZone("south", "hand", "OP17-054");
    const kyoId = engine.findCardInZone("south", "hand", "OP17-045");

    engine.playCard(op17RocksDXebec118, "south");
    const play = engine.pendingDecision("effectPlaySelection", "south").steps[0];
    if (play?.kind !== "selectEntity") throw new Error("Expected the replay choice.");
    // Stussy (3) + Kyo (2) total 5, well under the cap.
    engine.resolveDecision("effectPlaySelection", { selectedIds: [stussyId, kyoId] }, "south");

    const view = engine.getView("south").players.south;
    expect(view.characters.map((card) => card?.instanceId)).toContain(stussyId);
    expect(view.characters.map((card) => card?.instanceId)).toContain(kyoId);
    expect(engine.getView("south").prompts).toHaveLength(0);
  });
});
