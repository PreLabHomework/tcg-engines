import type { CharacterCard } from "@tcg/op-types";
import { op17Haruta009I18n } from "./009-haruta.i18n.ts";

export const op17Haruta009: CharacterCard = {
  id: "OP17-009",
  canonicalId: "OP17-009",
  slug: "haruta/op17-009",
  name: "Haruta",
  printings: [
    {
      id: "OP17-009",
      artId: "OP17-009",
      setCode: "OP17",
      collectorNumber: "009",
      rarity: "UC",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-009.png",
    },
  ],
  cardType: "character",
  color: ["red"],
  rarity: "UC",
  setId: "OP17",
  cost: 4,
  power: 5000,
  counter: 1000,
  traits: ["Whitebeard Pirates"],
  attribute: "slash",
  effect:
    "[Opponent's Turn] This Character gains +3000 power.\n[On Play] K.O. up to 1 of your opponent's Characters with 2000 base power or less.",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [
          {
            action: "ko",
            target: {
              player: "opponent",
              zones: ["character"],
              count: { amount: 1, upTo: true },
              filters: [{ filter: "basePower", comparison: "lte", value: 2000 }],
            },
          },
        ],
      },
    ],
    permanentEffects: [
      {
        conditions: [{ condition: "turn", value: "opponent" }],
        actions: [
          {
            action: "modifyPower",
            target: {
              player: "self",
              zones: ["character"],
              count: { amount: 1 },
              self: true,
            },
            value: 3000,
            duration: "permanent",
          },
        ],
      },
    ],
  },
  i18n: op17Haruta009I18n,
};
