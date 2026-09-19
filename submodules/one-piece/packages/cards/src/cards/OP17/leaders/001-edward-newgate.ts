import type { LeaderCard } from "@tcg/op-types";
import { op17EdwardNewgate001I18n } from "./001-edward-newgate.i18n.ts";

export const op17EdwardNewgate001: LeaderCard = {
  id: "OP17-001",
  canonicalId: "OP17-001",
  slug: "edward-newgate/op17-001",
  name: "Edward.Newgate",
  printings: [
    {
      id: "OP17-001",
      artId: "OP17-001",
      setCode: "OP17",
      collectorNumber: "001",
      rarity: "L",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-001.png",
    },
  ],
  cardType: "leader",
  color: ["red"],
  rarity: "L",
  setId: "OP17",
  power: 5000,
  // Mono-colored Leader, so 5 Life. The source dataset carries Life in its
  // `cost` field for Leader-category cards.
  life: 5,
  traits: ["The Four Emperors", "Whitebeard Pirates"],
  attribute: "special",
  effect:
    "[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand: Up to 1 of your Leader or Characters gains +4000 power during this battle.",
  effects: {
    effects: [
      {
        trigger: "onOpponentAttack",
        oncePerTurn: true,
        optional: true,
        costs: [{ cost: "trashFromHand", amount: 1 }],
        actions: [
          {
            action: "modifyPower",
            target: {
              player: "self",
              zones: ["leader", "character"],
              count: { amount: 1, upTo: true },
            },
            value: 4000,
            duration: "thisBattle",
          },
        ],
      },
    ],
  },
  i18n: op17EdwardNewgate001I18n,
};
