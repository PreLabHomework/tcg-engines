import type { EngineCommand, MatchSeat } from "../types.ts";
import { evaluatePosition, WIN_SCORE } from "./evaluate.ts";
import { ExpansionTooLargeError } from "./expand-actions.ts";
import type { SearchWorld } from "./search-world.ts";

/**
 * General search: the best ESTIMATED action at a given depth.
 *
 * Deliberately separate from the lethal solver. Lethal answers an exact yes/no
 * question; this returns a best estimate. General search is not built by
 * calling the lethal solver at every node: terminal scores already dominate
 * evaluator scores, so real mates overwhelm heuristics on their own.
 *
 * Explicit minimax by decision OWNERSHIP, not textbook negamax:
 *   seatToAct() === perspective  -> MAX node
 *   otherwise                    -> MIN node
 * The decision-maker does not alternate every ply. A seat can act, answer its
 * own prompt, act again, then the opponent answers a prompt. Flipping the sign
 * each ply would silently treat consecutive same-seat decisions as opposed.
 *
 * Terminal scores dominate evaluator scores and encode distance:
 *   perspective wins   +WIN_SCORE - plyFromRoot   (shorter wins preferred)
 *   perspective loses  -WIN_SCORE + plyFromRoot   (longer losses preferred)
 *   no winner          0
 *
 * Ties are broken by each action's index in the canonical legalActions()
 * order, NOT by visit order. Move ordering (previous-PV first) changes which
 * child is visited first; breaking ties by visit order would let ordering
 * change the chosen move even when the score is identical. With canonical
 * tie-breaking the result is provably independent of ordering.
 *
 * Still deliberately absent: transposition table, fingerprint-based pruning,
 * hidden-information handling. There is no search-safe position key yet.
 */
export interface SearchResult {
  bestAction: EngineCommand | null;
  principalVariation: EngineCommand[];
  score: number;
  requestedDepth: number;
  completedDepth: number;
  searchedNodes: number;
  status: "complete" | "partial";
  reason?: "node-budget" | "expansion-too-large";
}

export type LeafEvaluator = (world: SearchWorld, perspective: MatchSeat) => number;

export interface SearchOptions {
  perspective?: MatchSeat;
  maxDepth: number;
  nodeBudget?: number;
  maxActions?: number;
  /** Leaf evaluation. Defaults to evaluator v0's total. */
  evaluate?: LeafEvaluator;
  /**
   * Move ordering. "pv-first" searches the previous iteration's principal
   * variation move first. Ordering never changes the result, only the cost.
   */
  ordering?: "pv-first" | "none";
  /**
   * "alpha-beta" prunes; "none" is plain minimax, kept as the reference the
   * pruned search is tested against.
   */
  pruning?: "alpha-beta" | "none";
}

export const DEFAULT_SEARCH_NODE_BUDGET = 200_000;

const defaultEvaluate: LeafEvaluator = (world, perspective) =>
  evaluatePosition(world, perspective).total;

/** Raised to abandon an iteration that cannot complete. */
class IncompleteIteration extends Error {
  constructor(readonly reason: "node-budget" | "expansion-too-large") {
    super(reason);
  }
}

interface Scored {
  score: number;
  pv: EngineCommand[];
}

const sameCommand = (a: EngineCommand, b: EngineCommand) => JSON.stringify(a) === JSON.stringify(b);

interface Engine {
  searchedNodes: number;
  run(root: SearchWorld, depth: number, pvHint: readonly EngineCommand[]): Scored;
}

function createSearcher(options: SearchOptions, perspective: MatchSeat): Engine {
  const nodeBudget = options.nodeBudget ?? DEFAULT_SEARCH_NODE_BUDGET;
  const evaluate = options.evaluate ?? defaultEvaluate;
  const ordering = options.ordering ?? "pv-first";
  const pruning = options.pruning ?? "alpha-beta";
  const expandOptions = { maxActions: options.maxActions };

  const engine: Engine = {
    searchedNodes: 0,
    run(root, depth, pvHint) {
      return minimax(root, depth, 0, pvHint, -Infinity, Infinity);
    },
  };

  /**
   * Explicit MAX/MIN by ownership, with alpha and beta carried normally. No
   * sign flipping: consecutive same-seat decisions stay on the same side.
   */
  const minimax = (
    node: SearchWorld,
    depth: number,
    ply: number,
    pvHint: readonly EngineCommand[],
    alphaIn: number,
    betaIn: number,
  ): Scored => {
    engine.searchedNodes++;
    if (engine.searchedNodes > nodeBudget) throw new IncompleteIteration("node-budget");

    if (node.isTerminal()) {
      const winner = node.winner();
      if (winner === null) return { score: 0, pv: [] };
      return {
        score: winner === perspective ? WIN_SCORE - ply : -WIN_SCORE + ply,
        pv: [],
      };
    }
    if (depth === 0) return { score: evaluate(node, perspective), pv: [] };

    const mover = node.seatToAct();
    let actions: readonly EngineCommand[];
    try {
      actions = node.legalActions(mover, expandOptions);
    } catch (error) {
      if (error instanceof ExpansionTooLargeError) {
        throw new IncompleteIteration("expansion-too-large");
      }
      throw error;
    }
    // Concession is a dominated meta-action for both seats (see lethal.ts).
    const canonical = actions.filter((action) => action.type !== "concede");
    if (canonical.length === 0) return { score: evaluate(node, perspective), pv: [] };

    // Visit order: previous PV move first, then canonical order. Each entry
    // keeps its canonical index for order-independent tie-breaking.
    const indexed = canonical.map((action, index) => ({ action, index }));
    const hint = ordering === "pv-first" ? pvHint[0] : undefined;
    const hinted = hint ? indexed.findIndex(({ action }) => sameCommand(action, hint)) : -1;
    const visit =
      hinted > 0 ? [indexed[hinted]!, ...indexed.filter((_, i) => i !== hinted)] : indexed;

    const maximizing = mover === perspective;
    let best: { score: number; index: number; pv: EngineCommand[] } | null = null;
    let alpha = alphaIn;
    let beta = betaIn;

    for (const { action, index } of visit) {
      const step = node.apply(action);
      // Expansion is complete and sound, so a rejection is an interface bug.
      if (!step.accepted) {
        throw new Error(
          `Expanded action was rejected by the engine: ${JSON.stringify(action)} (${step.reason}).`,
        );
      }
      const childHint = hint && sameCommand(action, hint) ? pvHint.slice(1) : [];
      const child = minimax(step.world, depth - 1, ply + 1, childHint, alpha, beta);

      // Tie-breaking differs by mode, deliberately.
      //  - Plain minimax: every child's score is EXACT, so equal scores can be
      //    resolved by canonical index, making the result ordering-invariant.
      //  - Alpha-beta: a pruned child returns a BOUND, not its true value. A
      //    child cut off at exactly the current best may truly be worse, so
      //    switching to it on an index tie could pick a losing move. Only a
      //    strict improvement may replace the best.
      const improves = maximizing
        ? child.score > (best?.score ?? -Infinity)
        : child.score < (best?.score ?? Infinity);
      const exactTie =
        pruning === "none" && best !== null && child.score === best.score && index < best.index;
      if (best === null || improves || exactTie) {
        best = { score: child.score, index, pv: [action, ...child.pv] };
      }

      if (pruning === "alpha-beta") {
        if (maximizing) alpha = Math.max(alpha, best.score);
        else beta = Math.min(beta, best.score);
        if (alpha >= beta) break;
      }
    }

    return { score: best!.score, pv: best!.pv };
  };

  return engine;
}

/**
 * A single fixed-depth search: no iterative deepening, no ordering, and no
 * pruning unless asked. This is the plain-minimax REFERENCE that the
 * optimised search is tested against.
 */
export function searchFixedDepth(world: SearchWorld, options: SearchOptions): SearchResult {
  const perspective = options.perspective ?? world.perspective;
  const searcher = createSearcher(
    { ...options, ordering: "none", pruning: options.pruning ?? "none" },
    perspective,
  );
  try {
    const result = searcher.run(world, options.maxDepth, []);
    return {
      bestAction: result.pv[0] ?? null,
      principalVariation: result.pv,
      score: result.score,
      requestedDepth: options.maxDepth,
      completedDepth: options.maxDepth,
      searchedNodes: searcher.searchedNodes,
      status: "complete",
    };
  } catch (error) {
    if (!(error instanceof IncompleteIteration)) throw error;
    return {
      bestAction: null,
      principalVariation: [],
      score: (options.evaluate ?? defaultEvaluate)(world, perspective),
      requestedDepth: options.maxDepth,
      completedDepth: 0,
      searchedNodes: searcher.searchedNodes,
      status: "partial",
      reason: error.reason,
    };
  }
}

/**
 * Iterative deepening: depths 1, 2, ... maxDepth, each replacing the last.
 *
 * If an iteration cannot complete (budget or expansion refusal), the last
 * FULLY COMPLETED depth's answer is kept and the result is marked partial.
 * A proven shallower result is never discarded because a deeper one ran out.
 * The node budget is shared across iterations.
 */
export function search(world: SearchWorld, options: SearchOptions): SearchResult {
  const perspective = options.perspective ?? world.perspective;
  const searcher = createSearcher(options, perspective);

  let completed: { depth: number; score: number; pv: EngineCommand[] } = {
    depth: 0,
    score: (options.evaluate ?? defaultEvaluate)(world, perspective),
    pv: [],
  };

  for (let depth = 1; depth <= options.maxDepth; depth++) {
    try {
      const result = searcher.run(world, depth, completed.pv);
      completed = { depth, score: result.score, pv: result.pv };
    } catch (error) {
      if (!(error instanceof IncompleteIteration)) throw error;
      return {
        bestAction: completed.pv[0] ?? null,
        principalVariation: completed.pv,
        score: completed.score,
        requestedDepth: options.maxDepth,
        completedDepth: completed.depth,
        searchedNodes: searcher.searchedNodes,
        status: "partial",
        reason: error.reason,
      };
    }
  }

  return {
    bestAction: completed.pv[0] ?? null,
    principalVariation: completed.pv,
    score: completed.score,
    requestedDepth: options.maxDepth,
    completedDepth: completed.depth,
    searchedNodes: searcher.searchedNodes,
    status: "complete",
  };
}
