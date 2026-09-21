import { describe, expect, test } from "vite-plus/test";

// Import from the package entry point: it registers every card definition on
// load. Importing getCard from runtime-catalog directly would see an empty
// registry.
import { getCard } from "@tcg/op-cards";

/**
 * Milestone 1 representation gate: the three priority decks, as played on
 * OPTCGSim, must be fully representable by the engine.
 *
 * This is deliberately NOT a gameplay gate. It pins that every card resolves
 * to a registered definition with legal deck construction. Full deck-vs-deck
 * games are the next phase.
 */
type Entry = [id: string, count: number];
const DECKS: Record<string, { leader: string; main: Entry[] }> = {
  "OP17 Edward.Newgate": {
    leader: "OP17-001",
    main: [
      ["OP17-004", 2],
      ["OP17-003", 4],
      ["OP17-009", 3],
      ["OP16-118", 2],
      ["OP17-015", 4],
      ["OP17-008", 4],
      ["OP16-004", 4],
      ["OP17-006", 4],
      ["OP17-007", 4],
      ["OP16-003", 3],
      ["OP17-005", 4],
      ["OP17-017", 4],
      ["OP17-019", 4],
      ["OP16-021", 4],
    ],
  },
  "OP16 Yamato": {
    leader: "OP16-079",
    main: [
      ["OP16-091", 4],
      ["OP16-092", 4],
      ["OP16-081", 3],
      ["OP16-087", 4],
      ["OP16-088", 2],
      ["OP16-095", 1],
      ["OP13-093", 3],
      ["OP16-082", 4],
      ["OP16-084", 4],
      ["OP16-098", 4],
      ["OP16-096", 4],
      ["OP16-097", 4],
      ["OP16-085", 4],
      ["OP14-096", 2],
      ["OP16-099", 3],
    ],
  },
  "OP17 Rocks.D.Xebec": {
    leader: "OP17-039",
    main: [
      ["OP08-051", 4],
      ["OP17-045", 4],
      ["OP17-054", 4],
      ["OP17-041", 2],
      ["OP17-042", 2],
      ["OP17-044", 4],
      ["OP17-046", 4],
      ["OP17-049", 4],
      ["OP17-040", 4],
      ["OP17-048", 4],
      ["OP17-118", 4],
      ["OP17-055", 4],
      ["OP17-056", 4],
      ["EB02-030", 2],
    ],
  },
};

describe("Milestone 1: priority decks are fully representable", () => {
  for (const [name, deck] of Object.entries(DECKS)) {
    describe(name, () => {
      test("the Leader resolves and is a Leader", () => {
        const leader = getCard(deck.leader);
        expect(leader.cardType).toBe("leader");
      });

      test("every main-deck card resolves to a registered definition", () => {
        const missing = deck.main
          .map(([id]) => id)
          .filter((id) => {
            try {
              getCard(id);
              return false;
            } catch {
              return true;
            }
          });
        expect(missing).toEqual([]);
      });

      test("50 main-deck cards, at most 4 copies of each", () => {
        expect(deck.main.reduce((sum, [, count]) => sum + count, 0)).toBe(50);
        expect(deck.main.every(([, count]) => count >= 1 && count <= 4)).toBe(true);
      });

      test("every card shares a colour with the Leader", () => {
        const leaderColors = new Set(getCard(deck.leader).color);
        const offColour = deck.main
          .map(([id]) => getCard(id))
          .filter((card) => !card.color.some((color) => leaderColors.has(color)))
          .map((card) => card.id);
        expect(offColour).toEqual([]);
      });
    });
  }
});
