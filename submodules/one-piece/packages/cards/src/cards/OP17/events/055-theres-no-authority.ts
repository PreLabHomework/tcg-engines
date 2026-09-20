import type { EventCard } from "@tcg/op-types";
import { op17TheresNoAuthority055I18n } from "./055-theres-no-authority.i18n.ts";

export const op17TheresNoAuthority055: EventCard = {
  id: "OP17-055",
  canonicalId: "OP17-055",
  slug: "theres-no-authority-in-the-world-that-lasts-forever",
  name: "There's No Authority in the World That Lasts Forever!!!",
  printings: [
    {
      id: "OP17-055",
      artId: "OP17-055",
      setCode: "OP17",
      collectorNumber: "055",
      rarity: "R",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-055.png",
    },
  ],
  cardType: "event",
  color: ["blue"],
  rarity: "R",
  setId: "OP17",
  cost: 0,
  traits: ["Rocks Pirates"],
  effect:
    '[Main] You may rest 1 of your DON!! cards: Up to 1 of your [Rocks.D.Xebec] gains [Unblockable] during this turn.\n[Counter] Up to 1 of your Leader with a type including "Rocks Pirates" or up to 1 of your Character with a type including "Rocks Pirates" gains +2000 power during this battle.',
  effects: {
    effects: [
      {
        trigger: "main",
        costs: [{ cost: "restDon", amount: 1 }],
        actions: [
          {
            action: "grantKeyword",
            target: {
              player: "self",
              zones: ["character"],
              count: { amount: 1, upTo: true },
              filters: [{ filter: "name", value: "Rocks.D.Xebec" }],
            },
            keyword: "unblockable",
            duration: "thisTurn",
          },
        ],
        optional: true,
      },
      {
        trigger: "counter",
        actions: [
          {
            action: "modifyPower",
            target: {
              player: "self",
              zones: ["leader", "character"],
              count: { amount: 1, upTo: true },
              filters: [{ filter: "trait", value: "Rocks Pirates", match: "includes" }],
            },
            value: 2000,
            duration: "thisBattle",
          },
        ],
      },
    ],
  },
  i18n: op17TheresNoAuthority055I18n,
};
