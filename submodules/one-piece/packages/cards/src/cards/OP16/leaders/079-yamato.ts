import type { LeaderCard } from "@tcg/op-types";
import { op16Yamato079I18n } from "./079-yamato.i18n.ts";

export const op16Yamato079: LeaderCard = {
  id: "OP16-079",
  canonicalId: "OP16-079",
  slug: "yamato/op16-079",
  name: "Yamato",
  printings: [
    {
      id: "OP16-079",
      artId: "OP16-079",
      setCode: "OP16",
      collectorNumber: "079",
      rarity: "L",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP16-079.png",
    },
  ],
  cardType: "leader",
  color: ["black"],
  rarity: "L",
  setId: "OP16",
  power: 5000,
  life: 5,
  traits: ["Land of Wano"],
  attribute: "slash",
  effect:
    "When a {Land of Wano} type Character card is played from your trash, that Character gains [Rush] during this turn.",
  effects: {
    effects: [
      {
        trigger: "whenYouPlayCharacter",
        eventFilter: {
          player: "self",
          fromZone: "trash",
          filters: [{ filter: "trait", value: "Land of Wano", match: "includes" }],
        },
        actions: [
          {
            action: "grantKeyword",
            target: { player: "self", zones: ["character"], count: { amount: "all" } },
            keyword: "rush",
            duration: "thisTurn",
            triggerEventTarget: true,
          },
        ],
      },
    ],
  },
  i18n: op16Yamato079I18n,
};
