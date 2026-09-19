import type { Action, CharacterCard } from "@tcg/op-types";
import { op16PortgasDAce118I18n } from "./118-portgas-d-ace.i18n.ts";

const searchAction: Action = {
  action: "search",
  lookCount: 5,
  source: {
    player: "self",
    zone: "deck",
  },
  revealCount: {
    amount: 1,
    upTo: true,
  },
  revealFilters: [
    {
      filter: "trait",
      value: "Whitebeard Pirates",
      match: "includes",
    },
    {
      filter: "name",
      value: "Monkey.D.Luffy",
    },
  ],
  revealDestination: "hand",
  remainderPosition: "bottom",
};

export const op16PortgasDAce118: CharacterCard = {
  id: "OP16-118",
  canonicalId: "OP16-118",
  slug: "portgas-d-ace/op16-118",
  name: "Portgas.D.Ace",
  printings: [
    {
      id: "OP16-118",
      artId: "OP16-118",
      setCode: "OP16",
      collectorNumber: "118",
      rarity: "SEC",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP16-118.png",
    },
  ],
  cardType: "character",
  color: ["red"],
  rarity: "SEC",
  setId: "OP16",
  cost: 5,
  power: 6000,
  counter: 1000,
  traits: ["Whitebeard Pirates"],
  attribute: "special",
  effect:
    'The counter of all of your Character cards with 8000 power in your hand becomes +2000.\n[On Play]/[On K.O.] Look at 5 cards from the top of your deck; reveal up to 1 [Monkey.D.Luffy] or up to 1 card with a type including "Whitebeard Pirates" and add it to your hand. Then, place the rest at the bottom of your deck in any order.',
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [searchAction],
      },
      {
        trigger: "onKo",
        actions: [searchAction],
      },
    ],
    permanentEffects: [
      {
        actions: [
          {
            action: "setCounter",
            target: {
              player: "self",
              zones: ["hand"],
              count: { amount: "all" },
              filters: [
                { filter: "cardCategory", value: "character" },
                { filter: "power", comparison: "eq", value: 8000 },
              ],
            },
            value: 2000,
          },
        ],
      },
    ],
  },
  i18n: op16PortgasDAce118I18n,
};
