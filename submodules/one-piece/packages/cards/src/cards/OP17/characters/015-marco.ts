import type { CharacterCard } from "@tcg/op-types";
import { op17Marco015I18n } from "./015-marco.i18n.ts";

export const op17Marco015: CharacterCard = {
  id: "OP17-015",
  canonicalId: "OP17-015",
  slug: "marco/op17-015",
  name: "Marco",
  printings: [
    {
      id: "OP17-015",
      artId: "OP17-015",
      setCode: "OP17",
      collectorNumber: "015",
      rarity: "UC",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-015.png",
    },
  ],
  cardType: "character",
  color: ["red"],
  rarity: "UC",
  setId: "OP17",
  cost: 5,
  power: 6000,
  counter: 1000,
  traits: ["Whitebeard Pirates"],
  attribute: "special",
  effect:
    'If one of your Characters would be removed from the field by your opponent\'s effect, you may K.O. this Character instead.\n[On K.O.] You may trash 1 card with a type including "Whitebeard Pirates" from your hand: Play this Character card from your trash.',
  effects: {
    effects: [
      {
        trigger: "onKo",
        costs: [
          {
            cost: "trashFromHand",
            amount: 1,
            filters: [
              {
                filter: "trait",
                value: "Whitebeard Pirates",
                match: "includes",
              },
            ],
          },
        ],
        actions: [
          {
            action: "play",
            source: {
              player: "self",
              zone: "trash",
            },
            count: {
              amount: 1,
            },
            self: true,
          },
        ],
        optional: true,
      },
    ],
    replacementEffects: [
      {
        replacedEvent: "removeFromField",
        source: "opponentEffect",
        target: {
          player: "self",
          zones: ["character"],
          count: {
            amount: 1,
          },
        },
        replacementAction: {
          action: "ko",
          target: {
            player: "self",
            zones: ["character"],
            count: {
              amount: 1,
            },
            self: true,
          },
        },
      },
    ],
  },
  i18n: op17Marco015I18n,
};
