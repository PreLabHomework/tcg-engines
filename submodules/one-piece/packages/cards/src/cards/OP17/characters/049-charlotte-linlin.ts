import type { CharacterCard } from "@tcg/op-types";
import { op17CharlotteLinlin049I18n } from "./049-charlotte-linlin.i18n.ts";

export const op17CharlotteLinlin049: CharacterCard = {
  id: "OP17-049",
  canonicalId: "OP17-049",
  slug: "charlotte-linlin/op17-049",
  name: "Charlotte Linlin",
  printings: [
    {
      id: "OP17-049",
      artId: "OP17-049",
      setCode: "OP17",
      collectorNumber: "049",
      rarity: "R",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-049.png",
    },
  ],
  cardType: "character",
  color: ["blue"],
  rarity: "R",
  setId: "OP17",
  cost: 5,
  power: 7000,
  traits: ["Rocks Pirates"],
  attribute: "special",
  effect:
    "[On Play] Your opponent chooses one:\n• Draw 2 cards.\n• Your opponent trashes 2 cards from their hand.\n[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand: Up to 1 of your Leader or Characters gains +1000 power during this battle.",
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [
          {
            action: "choice",
            // The OPPONENT picks which mode resolves, not the controller.
            player: "opponent",
            options: [
              [{ action: "draw", player: "self", amount: 2 }],
              [{ action: "trashFromHand", player: "opponent", amount: 2 }],
            ],
          },
        ],
      },
      {
        trigger: "onOpponentAttack",
        costs: [{ cost: "trashFromHand", amount: 1 }],
        actions: [
          {
            action: "modifyPower",
            target: {
              player: "self",
              zones: ["leader", "character"],
              count: { amount: 1, upTo: true },
            },
            value: 1000,
            duration: "thisBattle",
          },
        ],
        optional: true,
        oncePerTurn: true,
      },
    ],
  },
  i18n: op17CharlotteLinlin049I18n,
};
