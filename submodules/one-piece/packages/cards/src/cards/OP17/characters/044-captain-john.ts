import type { CharacterCard } from "@tcg/op-types";
import { op17CaptainJohn044I18n } from "./044-captain-john.i18n.ts";

export const op17CaptainJohn044: CharacterCard = {
  id: "OP17-044",
  canonicalId: "OP17-044",
  slug: "captain-john/op17-044",
  name: "Captain John",
  printings: [
    {
      id: "OP17-044",
      artId: "OP17-044",
      setCode: "OP17",
      collectorNumber: "044",
      rarity: "UC",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-044.png",
    },
  ],
  cardType: "character",
  color: ["blue"],
  rarity: "UC",
  setId: "OP17",
  cost: 4,
  power: 6000,
  traits: ["Rocks Pirates"],
  attribute: "special",
  effect:
    'If your Leader\'s type includes "Rocks Pirates" and this Character is rested, your opponent cannot attack any card other than the Character [Captain John].\n[Activate: Main] You may rest this Character: Draw 1 card and trash 1 card from your hand.',
  effects: {
    effects: [
      {
        trigger: "activateMain",
        costs: [{ cost: "restThisCard" }],
        actions: [
          { action: "draw", player: "self", amount: 1 },
          { action: "trashFromHand", player: "self", amount: 1 },
        ],
        optional: true,
      },
    ],
    permanentEffects: [
      {
        // Both conditions are required: this is a conjunction, not either/or.
        conditions: [
          {
            condition: "compound",
            operator: "and",
            conditions: [
              // Quoted "Rocks Pirates" is CR 2-4-3-1, so match: "includes".
              { condition: "leaderTrait", trait: "Rocks Pirates", match: "includes" },
              {
                condition: "cardState",
                target: "this",
                property: "state",
                comparison: "eq",
                value: "rested",
              },
            ],
          },
        ],
        actions: [
          {
            action: "attackRestriction",
            // The engine applies this to the OPPONENT's attackers, and
            // `target` is the PERMITTED set: attacking anything outside it is
            // refused.
            restriction: "cannotAttackOtherThan",
            target: {
              player: "self",
              zones: ["character"],
              count: { amount: 1 },
              filters: [{ filter: "name", value: "Captain John" }],
            },
            duration: "permanent",
          },
        ],
      },
    ],
  },
  i18n: op17CaptainJohn044I18n,
};
