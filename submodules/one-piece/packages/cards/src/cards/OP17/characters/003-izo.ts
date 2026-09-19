import type { CharacterCard, Condition } from "@tcg/op-types";
import { op17Izo003I18n } from "./003-izo.i18n.ts";

const newgateOrWano: Condition = {
  condition: "compound",
  operator: "or",
  conditions: [
    { condition: "leaderName", name: "Edward.Newgate" },
    { condition: "leaderTrait", trait: "Land of Wano", match: "includes" },
  ],
};

export const op17Izo003: CharacterCard = {
  id: "OP17-003",
  canonicalId: "OP17-003",
  slug: "izo/op17-003",
  name: "Izo",
  printings: [
    {
      id: "OP17-003",
      artId: "OP17-003",
      setCode: "OP17",
      collectorNumber: "003",
      rarity: "R",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-003.png",
    },
  ],
  cardType: "character",
  color: ["red"],
  rarity: "R",
  setId: "OP17",
  cost: 4,
  power: 6000,
  traits: ["Land of Wano", "Whitebeard Pirates"],
  attribute: "ranged",
  effect:
    "[Rush: Character]\n[On Play] If your Leader is [Edward.Newgate] or has the {Land of Wano} type, give up to 1 of your opponent's rested Characters −6000 power during this turn.",
  effects: {
    keywords: ["rushCharacter"],
    effects: [
      {
        trigger: "onPlay",
        actions: [
          {
            action: "modifyPower",
            target: {
              player: "opponent",
              zones: ["character"],
              count: { amount: 1, upTo: true },
              filters: [{ filter: "state", value: "rested" }],
            },
            value: -6000,
            duration: "thisTurn",
            condition: newgateOrWano,
          },
        ],
      },
    ],
  },
  i18n: op17Izo003I18n,
};
