import type { MatchConfig, MatchSeat } from "../../src/types.ts";

/**
 * The three Milestone 1 priority decks, as played on OPTCGSim, shared by every
 * Phase 0 integration test.
 */
export type DeckId = "newgate" | "yamato" | "xebec";

interface DeckFixture {
  readonly label: string;
  readonly leaderCardId: string;
  readonly main: readonly (readonly [string, number])[];
}

export const DECKS: Record<DeckId, DeckFixture> = {
  newgate: {
    label: "OP17 Edward.Newgate",
    leaderCardId: "OP17-001",
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
  yamato: {
    label: "OP16 Yamato",
    leaderCardId: "OP16-079",
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
  xebec: {
    label: "OP17 Rocks.D.Xebec",
    leaderCardId: "OP17-039",
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

/** Phase 0 ceiling: high enough that max-actions means genuinely stuck. */
export const MAX_COMMANDS = 5000;

export const expandDeck = (id: DeckId): string[] =>
  DECKS[id].main.flatMap(([cardId, count]) => Array.from({ length: count }, () => cardId));

/** A match config for an ordered pairing. Callers pass an explicit seed. */
export const matchConfig = (south: DeckId, north: DeckId, seed: string): MatchConfig => ({
  firstPlayer: "south" satisfies MatchSeat,
  seed,
  shuffleDecks: true,
  openingHandSize: 5,
  skipFirstTurnDraw: true,
  maxCharacterSlots: 5,
  players: {
    south: {
      leaderCardId: DECKS[south].leaderCardId,
      mainDeck: expandDeck(south),
      playerName: `South(${DECKS[south].label})`,
    },
    north: {
      leaderCardId: DECKS[north].leaderCardId,
      mainDeck: expandDeck(north),
      playerName: `North(${DECKS[north].label})`,
    },
  },
});
