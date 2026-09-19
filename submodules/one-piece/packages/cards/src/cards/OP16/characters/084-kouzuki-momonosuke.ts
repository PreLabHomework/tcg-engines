import type { CharacterCard } from "@tcg/op-types";
import { op16KouzukiMomonosuke084I18n } from "./084-kouzuki-momonosuke.i18n.ts";

export const op16KouzukiMomonosuke084: CharacterCard = {
  id: "OP16-084",
  canonicalId: "OP16-084",
  slug: "kouzuki-momonosuke/op16-084",
  name: "Kouzuki Momonosuke",
  printings: [
    {
      id: "OP16-084",
      artId: "OP16-084",
      setCode: "OP16",
      collectorNumber: "084",
      rarity: "UC",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP16-084.png",
    },
  ],
  cardType: "character",
  color: ["black"],
  rarity: "UC",
  setId: "OP16",
  cost: 5,
  power: 0,
  counter: 2000,
  traits: ["Land of Wano", "Kouzuki Clan"],
  attribute: "slash",
  effect:
    "[Activate: Main] You may trash this Character with a cost of 20 or more: If you have 9 or more DON!! cards on your field, play up to 1 [Kouzuki Momonosuke] with a cost of 9 from your trash.",
  effects: {
    effects: [
      {
        trigger: "activateMain",
        // "trash this Character WITH A COST OF 20 OR MORE" gates the cost on
        // this card's current cost. TrashThisCardCost carries no filters, so
        // the gate is hoisted to an effect-level condition on the source card.
        conditions: [
          {
            condition: "cardState",
            target: "this",
            property: "cost",
            comparison: "gte",
            value: 20,
          },
        ],
        costs: [{ cost: "trashThisCard" }],
        actions: [
          {
            action: "play",
            source: { player: "self", zone: "trash" },
            count: { amount: 1, upTo: true },
            filters: [
              { filter: "cost", comparison: "eq", value: 9 },
              { filter: "name", value: "Kouzuki Momonosuke" },
            ],
            condition: {
              condition: "donFieldCount",
              player: "self",
              comparison: "gte",
              value: 9,
            },
          },
        ],
        optional: true,
      },
    ],
  },
  i18n: op16KouzukiMomonosuke084I18n,
};
