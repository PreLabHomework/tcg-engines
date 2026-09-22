import type { MatchSeat, MatchState } from "../types.ts";
import { getCardPower, getPlayer } from "../shared.ts";
import type { SearchWorld } from "./search-world.ts";

/**
 * Evaluator v0: deliberately dumb, explicitly weighted, fully explainable.
 *
 * The goal is NOT to play well. It is to give search a single trustworthy
 * number to optimise and to give the eventual coach a breakdown it can put
 * into words.
 *
 * Every feature is expressed as own - opponent, which gives the evaluator a
 * property worth relying on: evaluate(w, "south").total === -evaluate(w,
 * "north").total. A perspective bug shows up immediately as a broken
 * antisymmetry test.
 *
 * Deliberately excluded from v0:
 *  - trash count. Not generically good or bad. Yamato treats the trash as a
 *    resource while the other decks do not, so a deck-neutral weight would
 *    teach it nonsense.
 *  - rested DON!!. Spending DON!! to build a winning board is good, so a
 *    negative weight would punish the player for having taken actions.
 *  - immediate lethal. Answering "can I win right now" requires reasoning
 *    about blockers, counters, attack order and effects. That is search, not
 *    static evaluation, and belongs in the planned lethal solver.
 */
export interface EvalTerm {
  own: number;
  opponent: number;
  delta: number;
  weight: number;
  contribution: number;
}

export interface EvaluationBreakdown {
  perspective: MatchSeat;
  total: number;
  terminal: boolean;
  features: {
    life: EvalTerm;
    hand: EvalTerm;
    boardBodies: EvalTerm;
    boardPower: EvalTerm;
    activeDon: EvalTerm;
    attackPressure: EvalTerm;
  };
}

export interface EvaluationWeights {
  life: number;
  hand: number;
  boardBodies: number;
  boardPower: number;
  activeDon: number;
  attackPressure: number;
}

/**
 * Intentionally round, intentionally arguable. boardPower is per 1000 power so
 * it sits on a comparable scale to the count-based terms.
 */
export const DEFAULT_WEIGHTS: EvaluationWeights = {
  life: 300,
  hand: 120,
  boardBodies: 150,
  boardPower: 60,
  activeDon: 40,
  attackPressure: 90,
};

/**
 * Winning must never be outbid by positional terms, so the terminal score sits
 * far above anything the weights can reach. Search may later subtract ply to
 * prefer faster wins and slower losses.
 */
export const WIN_SCORE = 1_000_000;

const otherSeat = (seat: MatchSeat): MatchSeat => (seat === "south" ? "north" : "south");

const term = (own: number, opponent: number, weight: number): EvalTerm => {
  const delta = own - opponent;
  return { own, opponent, delta, weight, contribution: delta * weight };
};

const characterIds = (state: MatchState, seat: MatchSeat): string[] =>
  getPlayer(state, seat).characterArea.filter((id): id is string => id !== null);

/** Total power across a seat's Characters, in units of 1000. */
const boardPowerK = (state: MatchState, seat: MatchSeat): number =>
  characterIds(state, seat).reduce((sum, id) => sum + getCardPower(state, id), 0) / 1000;

/**
 * Proxy for offensive readiness: Characters that are not rested.
 *
 * Deliberately NOT computed by enumerating legal declareAttack commands. That
 * would be truer, but it is only non-zero on the seat's own turn, which would
 * break the own - opponent symmetry the evaluator relies on.
 */
const readyBodies = (state: MatchState, seat: MatchSeat): number =>
  characterIds(state, seat).filter((id) => !state.cards[id]?.rested).length;

export function evaluatePosition(
  world: SearchWorld,
  perspective: MatchSeat = world.perspective,
  weights: EvaluationWeights = DEFAULT_WEIGHTS,
): EvaluationBreakdown {
  const state = world.state;
  const them = otherSeat(perspective);
  const us = getPlayer(state, perspective);
  const foe = getPlayer(state, them);

  const features = {
    life: term(us.life.length, foe.life.length, weights.life),
    hand: term(us.hand.length, foe.hand.length, weights.hand),
    boardBodies: term(
      characterIds(state, perspective).length,
      characterIds(state, them).length,
      weights.boardBodies,
    ),
    boardPower: term(boardPowerK(state, perspective), boardPowerK(state, them), weights.boardPower),
    activeDon: term(us.activeDon, foe.activeDon, weights.activeDon),
    attackPressure: term(
      readyBodies(state, perspective),
      readyBodies(state, them),
      weights.attackPressure,
    ),
  };

  const positional = Object.values(features).reduce(
    (sum, feature) => sum + feature.contribution,
    0,
  );

  if (world.isTerminal()) {
    const winner = world.winner();
    // A drawn or winnerless terminal position scores flat rather than guessing.
    const total = winner === null ? 0 : winner === perspective ? WIN_SCORE : -WIN_SCORE;
    return { perspective, total, terminal: true, features };
  }

  return { perspective, total: positional, terminal: false, features };
}
