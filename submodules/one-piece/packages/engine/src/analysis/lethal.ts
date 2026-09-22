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

class NodeBudgetExceeded extends Error {}

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

  const search = (node: SearchWorld, depth: number): Verdict => {
    searchedNodes++;
    if (searchedNodes > nodeBudget) throw new NodeBudgetExceeded();

    if (node.isTerminal()) {
      return node.winner() === perspective ? { kind: "win", line: [] } : { kind: "no-win" };
    }
    // Depth exhausted without a terminal win is a legitimate negative for this
    // branch, not an indeterminate result: the question was bounded.
    if (depth >= options.maxPlies) return { kind: "no-win" };

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

    // A seat with no play available cannot be forced to win or lose here.
    if (candidates.length === 0) return { kind: "no-win" };

    const existential = mover === perspective;
    let sawIndeterminate: "expansion-too-large" | "node-budget" | null = null;
    // At a universal node every reply loses, so no single line represents the
    // node. We keep the FIRST reply's line as a concrete, replayable
    // representative; `line` is a principal variation, not the whole tree.
    let representative: EngineCommand[] | null = null;

    for (const action of candidates) {
      const step = node.apply(action);
      // Expansion is complete, so a rejected command means the generator and
      // the engine disagree. Surface it rather than silently skipping.
      if (!step.accepted) {
        throw new Error(
          `Expanded action was rejected by the engine: ${JSON.stringify(action)} (${step.reason}).`,
        );
      }
      const verdict = search(step.world, depth + 1);

      if (existential) {
        if (verdict.kind === "win") return { kind: "win", line: [action, ...verdict.line] };
        if (verdict.kind === "indeterminate") sawIndeterminate ??= verdict.reason;
      } else {
        // Universal: a single surviving reply refutes the forced win outright.
        if (verdict.kind === "no-win") return { kind: "no-win" };
        if (verdict.kind === "indeterminate") sawIndeterminate ??= verdict.reason;
        if (verdict.kind === "win") representative ??= [action, ...verdict.line];
      }
    }

    if (existential) {
      // No winning action found. If any branch was unresolved, we cannot claim
      // a complete search of this node.
      return sawIndeterminate
        ? { kind: "indeterminate", reason: sawIndeterminate }
        : { kind: "no-win" };
    }
    // Universal with no refutation: a win only if every reply was resolved.
    return sawIndeterminate
      ? { kind: "indeterminate", reason: sawIndeterminate }
      : { kind: "win", line: representative ?? [] };
  };

  try {
    const verdict = search(world, 0);
    if (verdict.kind === "win") {
      return {
        status: "forced-win",
        line: verdict.line,
        plies: verdict.line.length,
        searchedNodes,
      };
    }
    if (verdict.kind === "indeterminate") {
      return { status: "indeterminate", reason: verdict.reason, searchedNodes };
    }
    return { status: "no-forced-win", depthLimit: options.maxPlies, searchedNodes };
  } catch (error) {
    if (error instanceof NodeBudgetExceeded) {
      return { status: "indeterminate", reason: "node-budget", searchedNodes };
    }
    throw error;
  }
}
