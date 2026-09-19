import type { CharacterCard } from "@tcg/op-types";
import { op16Shinobu087I18n } from "./087-shinobu.i18n.ts";

export const op16Shinobu087: CharacterCard = {
  id: "OP16-087",
  canonicalId: "OP16-087",
  slug: "shinobu/op16-087",
  name: "Shinobu",
  printings: [
    {
      id: "OP16-087",
      artId: "OP16-087",
      setCode: "OP16",
      collectorNumber: "087",
      rarity: "C",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP16-087.png",
    },
  ],
  cardType: "character",
  color: ["black"],
  rarity: "C",
  setId: "OP16",
  cost: 2,
  power: 1000,
  counter: 1000,
  traits: ["Land of Wano"],
  attribute: "special",
  effect:
    "[On Play] You may trash this Character: Draw 1 card and up to 1 of your [Kouzuki Momonosuke] gains +20 cost during this turn.",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        costs: [{ cost: "trashThisCard" }],
        actions: [
          { action: "draw", player: "self", amount: 1 },
          {
            action: "modifyCost",
            target: {
              player: "self",
              zones: ["character"],
              count: { amount: 1, upTo: true },
              filters: [{ filter: "name", value: "Kouzuki Momonosuke" }],
            },
            value: 20,
            duration: "thisTurn",
          },
        ],
        optional: true,
      },
    ],
  },
  i18n: op16Shinobu087I18n,
};
