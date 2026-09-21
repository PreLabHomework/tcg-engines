import type { EffectBlock, CharacterCard } from "@tcg/op-types";
import { op17Shiki048I18n } from "./048-shiki.i18n.ts";

/**
 * One printed [Once Per Turn] ability listed under two triggers. Both branches
 * share an oncePerTurnKey so using it on your attack locks it out when you are
 * attacked in the same turn, and the lock resets at the turn boundary.
 */
const SHARED_KEY = "op17-048:rocks-pirates-debuff";

const debuff = (trigger: EffectBlock["trigger"]): EffectBlock => ({
  trigger,
  costs: [
    {
      cost: "trashFromHand",
      amount: 1,
      filters: [{ filter: "trait", value: "Rocks Pirates", match: "includes" }],
    },
  ],
  actions: [
    {
      action: "modifyPower",
      target: { player: "opponent", zones: ["character"], count: { amount: 1, upTo: true } },
      value: -3000,
      duration: "thisTurn",
    },
  ],
  optional: true,
  oncePerTurn: true,
  oncePerTurnKey: SHARED_KEY,
});

export const op17Shiki048: CharacterCard = {
  id: "OP17-048",
  canonicalId: "OP17-048",
  slug: "shiki/op17-048",
  name: "Shiki",
  printings: [
    {
      id: "OP17-048",
      artId: "OP17-048",
      setCode: "OP17",
      collectorNumber: "048",
      rarity: "SR",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-048.png",
    },
  ],
  cardType: "character",
  color: ["blue"],
  rarity: "SR",
  setId: "OP17",
  cost: 7,
  power: 9000,
  traits: ["Rocks Pirates"],
  attribute: "slash",
  effect:
    "[Rush: Character]\n[When Attacking]/[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card with a type including \"Rocks Pirates\" from your hand: Give up to 1 of your opponent's Characters −3000 power during this turn.",
  effects: {
    keywords: ["rushCharacter"],
    effects: [debuff("whenAttacking"), debuff("onOpponentAttack")],
  },
  i18n: op17Shiki048I18n,
};
