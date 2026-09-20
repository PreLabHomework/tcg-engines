import type { CharacterCard } from "@tcg/op-types";
import { op17Kyo045I18n } from "./045-kyo.i18n.ts";

export const op17Kyo045: CharacterCard = {
  id: "OP17-045",
  canonicalId: "OP17-045",
  slug: "kyo/op17-045",
  name: "Kyo",
  printings: [
    {
      id: "OP17-045",
      artId: "OP17-045",
      setCode: "OP17",
      collectorNumber: "045",
      rarity: "UC",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-045.png",
    },
  ],
  cardType: "character",
  color: ["blue"],
  rarity: "UC",
  setId: "OP17",
  cost: 2,
  power: 4000,
  traits: ["Rocks Pirates"],
  attribute: "slash",
  effect:
    "If one of your Characters would be removed from the field by your opponent's effect, you may trash 2 cards from your hand instead.\n[On Play] Draw 1 card.",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [{ action: "draw", player: "self", amount: 1 }],
      },
    ],
    // Dropped entirely by the parser, like OP17-015 Marco. Unlike Marco, the
    // substitute cost is paid from hand rather than by K.O.ing this card.
    replacementEffects: [
      {
        replacedEvent: "removeFromField",
        source: "opponentEffect",
        target: {
          player: "self",
          zones: ["character"],
          count: { amount: 1 },
        },
        // The substitute IS the replacement action: trash 2 from hand instead
        // of the Character leaving the field. Omitting `mandatory` leaves it
        // optional ("you may"), matching the printed text.
        replacementAction: { action: "trashFromHand", player: "self", amount: 2 },
      },
    ],
  },
  i18n: op17Kyo045I18n,
};
