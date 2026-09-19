import { describe, expect, test } from "vite-plus/test";
import {
  op16NicoRobin092,
  op16Yamato079,
  op16Yamato096,
  op17Izo003,
  op17Jozu008,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../../src/index.ts";

/**
 * OP16-092 Nico Robin
 *   [On Play] You may trash 1 Character card with a cost of 8 or more from
 *   your hand: Draw 2 cards.
 *
 * Proof pattern notes:
 *  - The cost filter and the draw are asserted separately.
 *  - OP16-096 Yamato is cost 8 (payable); OP17-003 Izo is cost 4 (not).
 *  - A "you may" card needs accept, decline, and cannot-pay paths.
 */
describe("OP16-092 Nico Robin", () => {
  const setup = (extraHand: { card: typeof op17Jozu008 }[]) =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op16Yamato079,
        hand: [{ card: op16NicoRobin092 }, ...extraHand],
        deck: [op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { life: 3 },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("trashing a cost-8 Character from hand draws 2", () => {
    const engine = setup([{ card: op16Yamato096 }]);
    // Robin and the cost-8 Yamato.
    expect(engine.getView("south").players.south.hand).toHaveLength(2);

    engine.play(op16NicoRobin092, "south");
    engine.resolveDecision("effectOptional", { optionId: "yes" }, "south");

    const view = engine.getView("south");
    expect(view.players.south.trash.map((card) => card.cardId)).toContain(op16Yamato096.id);
    // Played Robin, paid the Yamato, drew two: hand of 2 -> 2.
    expect(view.players.south.hand).toHaveLength(2);
    expect(view.prompts).toHaveLength(0);
  });

  test("a Character below cost 8 cannot pay, so no effect is offered", () => {
    const engine = setup([{ card: op17Izo003 }]);
    const handBefore = engine.getView("south").players.south.hand.length;

    engine.play(op16NicoRobin092, "south");

    const view = engine.getView("south");
    // OP17-003 Izo is cost 4, so the cost is unpayable and nothing resolves.
    expect(view.players.south.trash).toHaveLength(0);
    expect(view.players.south.hand).toHaveLength(handBefore - 1);
    expect(view.prompts).toHaveLength(0);
  });

  test("declining keeps the payable card in hand and draws nothing", () => {
    const engine = setup([{ card: op16Yamato096 }]);

    engine.play(op16NicoRobin092, "south");
    engine.resolveDecision("effectOptional", { optionId: "no" }, "south");

    const view = engine.getView("south");
    expect(view.players.south.trash).toHaveLength(0);
    expect(view.players.south.hand.map((card) => card.cardId)).toContain(op16Yamato096.id);
    expect(view.players.south.hand).toHaveLength(1);
    expect(view.prompts).toHaveLength(0);
  });
});
