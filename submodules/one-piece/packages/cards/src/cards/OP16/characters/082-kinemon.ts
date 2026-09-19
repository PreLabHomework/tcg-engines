import type { CharacterCard } from "@tcg/op-types";
import { op16Kinemon082I18n } from "./082-kinemon.i18n.ts";

export const op16Kinemon082: CharacterCard = {
  id: "OP16-082",
  canonicalId: "OP16-082",
  slug: "kinemon/op16-082",
  name: "Kin'emon",
  printings: [
    {
      id: "OP16-082",
      artId: "OP16-082",
      setCode: "OP16",
      collectorNumber: "082",
      rarity: "C",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP16-082.png",
    },
  ],
  cardType: "character",
  color: ["black"],
  rarity: "C",
  setId: "OP16",
  cost: 4,
  power: 6000,
  traits: ["Land of Wano", "The Akazaya Nine"],
  attribute: "slash",
  effect:
    "This Character gains +3 cost.\n[On Play] If your Leader has the {Land of Wano} type, look at 5 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, trash the rest.",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        conditions: [{ condition: "leaderTrait", trait: "Land of Wano", match: "includes" }],
        actions: [
          {
            action: "search",
            lookCount: 5,
            source: { player: "self", zone: "deck" },
            revealCount: { amount: 1, upTo: true },
            revealFilters: [{ filter: "trait", value: "Land of Wano", match: "includes" }],
            revealDestination: "hand",
            remainderPosition: "trash",
          },
        ],
      },
    ],
    permanentEffects: [
      {
        actions: [
          {
            action: "modifyCost",
            target: {
              player: "self",
              zones: ["character"],
              count: { amount: 1 },
              self: true,
            },
            value: 3,
          },
        ],
      },
    ],
  },
  i18n: op16Kinemon082I18n,
};
