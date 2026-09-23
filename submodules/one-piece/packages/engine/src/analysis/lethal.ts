import type { EngineCommand, MatchSeat } from "../types.ts";
import { ExpansionTooLargeError } from "./expand-actions.ts";
import type { SearchWorld } from "./search-world.ts";

/**
 * Bounded lethal solver.
 *
 * Answers exactly one question: from this perfect-information position, does
 * the perspective player have a FORCED win within `maxPlies` actions?
 *
 * "Forced win" means a terminal win forced through gameplay, assuming neither
 * player voluntarily concedes. Concession is legal for either seat at any
 * time (1-2-3) but is excluded here as a strategically dominated meta-action.
 * Excluding it cannot change the answer: at our existential nodes conceding
 * is a losing branch and can never establish a win, and at the opponent's
 * universal nodes their concession is already a win for us, so every
 * non-concession reply still has to lose. The bot harness excludes it for the
 * same reason.
 *
 * This is minimax over decision OWNERSHIP, not over turns:
 *   seatToAct() === perspective  -> existential, one winning action suffices
 *   otherwise                    -> universal, every reply must still lose
 * Cards such as OP17-049 Charlotte Linlin hand a choice to the opponent
 * during our own turn, so turn-based quantification would be wrong.
 *
 * A ply is one concrete action, prompt resolutions included, not a game turn.
 *
 * `line` is a principal variation, not the whole proof tree. At the
 * perspective player's nodes it is the winning action. At opponent nodes every
 * reply loses, so one is shown as a concrete representative. Replaying the
 * line therefore reaches a terminal win, and every command in it was legal at
 * the node where it was chosen.
 *
 * Stopping conditions are only: terminal, depth bound, node budget, and
 * expansion refusal. Deliberately NO transposition table and NO
 * repeated-position pruning: there is no search-safe position key yet.
 * diagnosticFingerprint strips eventSequence, which effect-shuffle RNG keys
 * on, so two identical fingerprints can have genuinely different futures and
 * pruning on it could delete a real winning line.
 */
export type LethalResult =
  | {
      status: "forced-win";
      line: EngineCommand[];
      plies: number;
      searchedNodes: number;
    }
  | {
      status: "no-forced-win";
      depthLimit: number;
      searchedNodes: number;
    }
  | {
      status: "indeterminate";
      reason: "expansion-too-large" | "node-budget";
      searchedNodes: number;
    };

export interface LethalOptions {
  perspective?: MatchSeat;
  /** Maximum concrete actions to look ahead. */
  maxPlies: number;
  /** Hard cap on visited nodes; exceeding it yields `indeterminate`. */
  nodeBudget?: number;
  /** Refusal threshold handed to action expansion. */
  maxActions?: number;
}

export const DEFAULT_NODE_BUDGET = 200_000;

/** Three-valued search outcome for an internal node. */
type Verdict =
  | { kind: "win"; line: EngineCommand[] }
  | { kind: "no-win" }
  | { kind: "indeterminate"; reason: "expansion-too-large" | "node-budget" };

/**
 * Mate-distance semantics. The returned line is a principal variation against
 * BEST DEFENCE, so `plies` is the true minimax mate distance:
 *
 *   perspective (existential) node   the SHORTEST forced win among children
 *   opponent (universal) node        every child must be a forced win, and the
 *                                    representative is the LONGEST of them,
 *                                    i.e. the most stubborn defence
 *
 * Three-valued combination, applied per node so a proven result is never lost
 * to an unresolved sibling:
 *
 *   OUR NODE        any forced-win -> forced-win
 *                   all no-win     -> no-win
 *                   otherwise      -> indeterminate
 *   OPPONENT NODE   any no-win     -> no-win   (one escape suffices)
 *                   all forced-win -> forced-win
 *                   otherwise      -> indeterminate
 *
 * The node budget is therefore enforced per node, returning `indeterminate`
 * for that node rather than aborting the whole search, so a win already
 * established elsewhere survives running out of budget later.
 */
export function findLethal(world: SearchWorld, options: LethalOptions): LethalResult {
  const perspective = options.perspective ?? world.perspective;
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const expandOptions = { maxActions: options.maxActions };

  if (world.state.status !== "active") {
    throw new Error(
      `findLethal requires an in-progress gameplay position; got status "${world.state.status}". ` +
        `Setup decisions (mulligan, first player, startGame) are outside the lethal question.`,
    );
  }

  let searchedNodes = 0;

  /**
   * `limit` is the absolute depth by which a terminal win must be reached.
   * Terminal positions are recognised even at depth === limit; only expansion
   * stops there. Existential nodes tighten it for later siblings once a win is
   * known, so they only search for strictly faster mates. That is exact
   * mate-distance pruning, not heuristic pruning: a longer win elsewhere could
   * never replace a shorter one we already hold.
   */
  const search = (node: SearchWorld, depth: number, limit: number): Verdict => {
    searchedNodes++;
    if (searchedNodes > nodeBudget) return { kind: "indeterminate", reason: "node-budget" };

    if (node.isTerminal()) {
      return node.winner() === perspective ? { kind: "win", line: [] } : { kind: "no-win" };
    }
    // Depth exhausted without a terminal win is a legitimate negative for this
    // branch, not an indeterminate result: the question was bounded.
    if (depth >= limit) return { kind: "no-win" };

    const mover = node.seatToAct();
    let actions: readonly EngineCommand[];
    try {
      actions = node.legalActions(mover, expandOptions);
    } catch (error) {
      if (error instanceof ExpansionTooLargeError) {
        return { kind: "indeterminate", reason: "expansion-too-large" };
      }
      throw error;
    }
    // Policy layer, not the action layer: legalActions() stays faithful to the
    // engine and keeps meaning "all concrete legal commands".
    const candidates = actions.filter((action) => action.type !== "concede");
    if (candidates.length === 0) return { kind: "no-win" };

    const advance = (action: EngineCommand) => {
      const step = node.apply(action);
      // Expansion is complete, so a rejected command means the generator and
      // the engine disagree. Surface it rather than silently skipping.
      if (!step.accepted) {
        throw new Error(
          `Expanded action was rejected by the engine: ${JSON.stringify(action)} (${step.reason}).`,
        );
      }
      return step.world;
    };

    let sawIndeterminate: "expansion-too-large" | "node-budget" | null = null;

    if (mover === perspective) {
      let best: EngineCommand[] | null = null;
      let currentLimit = limit;
      for (const action of candidates) {
        // Check the budget BEFORE advancing. Applying a child is the expensive
        // step, so an exhausted budget must stop the loop rather than apply
        // every remaining sibling only to have each return immediately.
        if (searchedNodes >= nodeBudget) {
          sawIndeterminate ??= "node-budget";
          break;
        }
        const verdict = search(advance(action), depth + 1, currentLimit);
        if (verdict.kind === "win") {
          const line = [action, ...verdict.line];
          if (best === null || line.length < best.length) {
            best = line;
            currentLimit = depth + line.length - 1;
          }
          // Nothing beats an immediate win.
          if (best.length === 1) break;
        } else if (verdict.kind === "indeterminate") {
          sawIndeterminate ??= verdict.reason;
        }
      }
      if (best !== null) return { kind: "win", line: best };
      return sawIndeterminate
        ? { kind: "indeterminate", reason: sawIndeterminate }
        : { kind: "no-win" };
    }

    let worst: EngineCommand[] | null = null;
    for (const action of candidates) {
      if (searchedNodes >= nodeBudget) {
        sawIndeterminate ??= "node-budget";
        break;
      }
      const verdict = search(advance(action), depth + 1, limit);
      // One surviving reply refutes the forced win outright.
      if (verdict.kind === "no-win") return { kind: "no-win" };
      if (verdict.kind === "indeterminate") {
        sawIndeterminate ??= verdict.reason;
      } else {
        const line = [action, ...verdict.line];
        if (worst === null || line.length > worst.length) worst = line;
      }
    }
    if (sawIndeterminate) return { kind: "indeterminate", reason: sawIndeterminate };
    return { kind: "win", line: worst ?? [] };
  };

  const verdict = search(world, 0, options.maxPlies);
  if (verdict.kind === "win") {
    return { status: "forced-win", line: verdict.line, plies: verdict.line.length, searchedNodes };
  }
  if (verdict.kind === "indeterminate") {
    return { status: "indeterminate", reason: verdict.reason, searchedNodes };
  }
  return { status: "no-forced-win", depthLimit: options.maxPlies, searchedNodes };
}
