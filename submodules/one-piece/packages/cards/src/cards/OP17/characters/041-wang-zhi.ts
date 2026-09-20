import type { CharacterCard } from "@tcg/op-types";
import { op17WangZhi041I18n } from "./041-wang-zhi.i18n.ts";

export const op17WangZhi041: CharacterCard = {
  id: "OP17-041",
  canonicalId: "OP17-041",
  slug: "wang-zhi/op17-041",
  name: "Wang Zhi",
  printings: [
    {
      id: "OP17-041",
      artId: "OP17-041",
      setCode: "OP17",
      collectorNumber: "041",
      rarity: "UC",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-041.png",
    },
  ],
  cardType: "character",
  color: ["blue"],
  rarity: "UC",
  setId: "OP17",
  cost: 4,
  power: 6000,
  traits: ["Rocks Pirates"],
  attribute: "strike",
  effect:
    "[Blocker]\n[On Play] You may trash 1 card from your hand: Place all of your opponent's Characters with a base cost of 1 at the bottom of the owner's deck in any order of the owner's choosing.",
  effects: {
    keywords: ["blocker"],
    effects: [
      {
        trigger: "onPlay",
        costs: [{ cost: "trashFromHand", amount: 1 }],
        actions: [
          {
            action: "returnToDeck",
            target: {
              player: "opponent",
              zones: ["character"],
              count: { amount: "all" },
              // "base cost of 1": baseCost ignores cost modifiers.
              filters: [{ filter: "baseCost", comparison: "eq", value: 1 }],
            },
            position: "bottom",
            // "in any order of the owner's choosing".
            order: "any",
          },
        ],
        optional: true,
      },
    ],
  },
  i18n: op17WangZhi041I18n,
};
