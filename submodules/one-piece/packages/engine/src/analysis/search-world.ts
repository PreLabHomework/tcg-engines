import type { EngineCommand, MatchSeat, MatchState } from "../types.ts";
import { applyCommand } from "../core.ts";
import { type ExpandOptions, expandLegalActions } from "./expand-actions.ts";

/**
 * Perfect-information search primitive.
 *
 * This is the PERFECT-INFORMATION mechanics layer. It wraps MatchState, which
 * is the engine's complete rules state, because search needs an actual hidden
 * world in order to advance effects correctly. A PlayerView cannot serve as
 * the search state: it does not contain the opponent's hand, life identities
 * or deck order, so an effect that searches, trashes or reveals those zones
 * could not be resolved without inventing cards. Inventing cards is belief
 * sampling, not rules behaviour.
 *
 * The intended layering is therefore:
 *
 *   PlayerView + belief   ->   sample N plausible MatchStates   ->   SearchWorld
 *
 * Determinisation lives ABOVE this facade, never inside engine mechanics.
 *
 * Nothing here implements rules. Every method adapts something the engine
 * already provides, so this file must stay free of game logic.
 *
 * Action expansion lives in expand-actions.ts, which turns the engine's
 * descriptor summary into concrete commands. Deliberately NOT used: the
 * engine's commandFromDescriptor is a BOT POLICY helper, not a faithful
 * converter. It ignores which chooseJoKenPo descriptor it was handed and
 * always picks by its own rule, and returns null for concede because bots
 * never concede. Wiring it in would silently shrink the branching factor.
 *
 * Note on honesty: holding a SearchWorld means holding perfect information.
 * That is correct for an internal search kernel and for explicitly-labelled
 * oracle analysis, but a user-facing coach must not be handed one directly.
 * See analyzeOracle vs analyze in the layering notes.
 */
export interface SearchWorld {
  /** The complete rules state of this world. */
  readonly state: MatchState;
  /** The seat this world is being searched on behalf of. */
  readonly perspective: MatchSeat;

  /**
   * The branching surface: every concrete legal action for a seat, prompt
   * resolutions included and fully expanded.
   *
   * Descriptors are a UI abstraction and deliberately do not leak here. A
   * searcher must never see that "Attack with X" originally summarised three
   * target choices.
   *
   * Throws rather than truncating if expansion exceeds the budget; see
   * ExpansionTooLargeError. Callers must treat that as INDETERMINATE, never as
   * "no actions available".
   */
  legalActions(seat?: MatchSeat, options?: ExpandOptions): readonly EngineCommand[];
  /**
   * Advance the world. Returns a NEW world; the receiver is untouched, so a
   * searcher may branch freely without cloning.
   */
  apply(command: EngineCommand): SearchWorldStep;
  isTerminal(): boolean;
  winner(): MatchSeat | null;
  /**
   * NON-CANONICAL position fingerprint. Deliberately named to prevent misuse:
   * it is derived from instance identity, so two substantively identical
   * positions reached by different routes may fingerprint differently. It is
   * safe for cycle detection and diagnostics and MUST NOT be used as a
   * transposition-table key. A canonical key is a real, separate problem.
   */
  diagnosticFingerprint(): string;
}

/** The result of advancing a world, including whether the engine accepted it. */
export interface SearchWorldStep {
  readonly world: SearchWorld;
  readonly accepted: boolean;
  readonly reason: string | null;
}

/**
 * Fields excluded from the fingerprint because they are path-dependent rather
 * than position-dependent. Matches the harness's cycle detector.
 */
const PATH_DEPENDENT_KEYS = new Set([
  "idCounter",
  "commandHistory",
  "logHistory",
  "eventHistory",
  "eventSequence",
]);

const fingerprint = (state: MatchState): string =>
  JSON.stringify(state, (key, value) => (PATH_DEPENDENT_KEYS.has(key) ? undefined : value));

export function createSearchWorld(state: MatchState, perspective: MatchSeat): SearchWorld {
  return {
    state,
    perspective,
    legalActions(seat = state.activeSeat, options = {}) {
      return expandLegalActions(state, seat, options);
    },
    apply(command) {
      // applyCommand is immutable (produceWithPatches), so `state` above is
      // unaffected and branching needs no clone.
      const result = applyCommand(state, command);
      return {
        world: createSearchWorld(result.state, perspective),
        accepted: result.accepted,
        reason: result.reason,
      };
    },
    isTerminal() {
      return state.status === "finished";
    },
    winner() {
      return state.winner ?? null;
    },
    diagnosticFingerprint() {
      return fingerprint(state);
    },
  };
}
