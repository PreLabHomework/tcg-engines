import type { EffectBlock, CharacterCard } from "@tcg/op-types";
import { op17EdwardNewgate040I18n } from "./040-edward-newgate.i18n.ts";

/**
 * "attacks or is attacked" is two distinct engine events, so the printed
 * clause becomes two blocks sharing one body. The quoted "Rocks Pirates"
 * wording is CR 2-4-3-1, hence match: "includes".
 */
const leaderIsRocks = [
  { filter: "cardCategory", value: "leader" },
  { filter: "trait", value: "Rocks Pirates", match: "includes" },
] as const;

const boost = (
  trigger: EffectBlock["trigger"],
  eventFilter: EffectBlock["eventFilter"],
): EffectBlock => ({
  trigger,
  eventFilter,
  costs: [{ cost: "trashFromHand", amount: 1 }],
  actions: [
    {
      action: "modifyPower",
      target: { player: "self", zones: ["leader"], count: { amount: "all" } },
      value: 3000,
      duration: "thisBattle",
    },
  ],
  optional: true,
  oncePerTurn: true,
});

export const op17EdwardNewgate040: CharacterCard = {
  id: "OP17-040",
  canonicalId: "OP17-040",
  slug: "edward-newgate/op17-040",
  name: "Edward.Newgate",
  printings: [
    {
      id: "OP17-040",
      artId: "OP17-040",
      setCode: "OP17",
      collectorNumber: "040",
      rarity: "R",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP17-040.png",
    },
  ],
  cardType: "character",
  color: ["blue"],
  rarity: "R",
  setId: "OP17",
  cost: 6,
  power: 8000,
  traits: ["Rocks Pirates"],
  attribute: "special",
  effect:
    '[On Play] Draw 1 card.\n[Once Per Turn] When your Leader with a type including "Rocks Pirates" attacks or is attacked, you may trash 1 card from your hand to activate this effect. Your Leader gains +3000 power during this battle.',
  effects: {
    effects: [
      {
        trigger: "onPlay",
        actions: [{ action: "draw", player: "self", amount: 1 }],
      },
      // Your Leader attacks. Observing ANOTHER friendly card attack needs
      // whenFriendlyCardAttacks; "whenAttacking" fires only on the attacker
      // itself. eventFilter.filters matches event.instanceId (the attacker).
      boost("whenFriendlyCardAttacks", { filters: [...leaderIsRocks] }),
      // Your Leader is attacked: here the Leader is the attack's target.
      boost("onOpponentAttack", { targetFilters: [...leaderIsRocks] }),
    ],
  },
  i18n: op17EdwardNewgate040I18n,
};
