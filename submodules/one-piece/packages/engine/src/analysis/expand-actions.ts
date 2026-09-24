import type {
  ChoiceKind,
  EngineCommand,
  JoKenPoChoice,
  LegalCommandDescriptor,
  MatchSeat,
  MatchState,
  PromptState,
} from "../types.ts";
import { getLegalCommands } from "../engine/legal.ts";
import { isValidPlaySelection } from "../effects/resolution.ts";

/**
 * Action expansion: turn the engine's legal-command SUMMARY into the concrete
 * move list a searcher branches over.
 *
 * A LegalCommandDescriptor is a UI-sized abstraction. Three families stand for
 * many distinct actions at once:
 *
 *   declareAttack   one descriptor per attacker, carrying every legal target
 *   playCard        one descriptor per card, carrying every open slot
 *   resolvePrompt   one descriptor per prompt, carrying every option
 *
 * A searcher that treated descriptors as its branching factor would collapse
 * every attack-target and slot choice into a single move, which is precisely
 * where lethal lives.
 *
 * Contract:
 *   COMPLETE     every legal concrete command the descriptor represents
 *   SOUND        every returned command is accepted from this state
 *   DISTINCT     semantically distinct resolutions stay distinct
 *   POLICY-FREE  no preferred target, slot, option or ordering
 *   DETERMINISTIC same state + descriptor gives the same list, in order
 *   FAIL LOUDLY   unknown shapes throw rather than choosing something
 *
 * Expansion is COMPLETE or EXPLICITLY UNAVAILABLE. It is never partial.
 * Truncating would let a lethal solver report "no forced win" when it simply
 * never looked at the winning branch.
 */
export class ExpansionTooLargeError extends Error {
  readonly promptId: string | null;
  readonly kind: string;
  readonly optionCount: number;
  readonly requiredBranches: bigint;
  readonly maxActions: number;

  constructor(details: {
    promptId: string | null;
    kind: string;
    optionCount: number;
    requiredBranches: bigint;
    maxActions: number;
  }) {
    super(
      `Expansion of ${details.kind} would need ${details.requiredBranches} branches ` +
        `from ${details.optionCount} options, above the ${details.maxActions} budget. ` +
        `Refusing rather than truncating.`,
    );
    this.name = "ExpansionTooLargeError";
    this.promptId = details.promptId;
    this.kind = details.kind;
    this.optionCount = details.optionCount;
    this.requiredBranches = details.requiredBranches;
    this.maxActions = details.maxActions;
  }
}

export class UnexpandableDescriptorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnexpandableDescriptorError";
  }
}

export interface ExpandOptions {
  /** Refusal threshold, never a silent filter. */
  maxActions?: number;
}

export const DEFAULT_MAX_ACTIONS = 100_000;

/* ------------------------------------------------------------------ *
 * Preflight counting. Done in bigint BEFORE generating anything, so a
 * pathological prompt fails instead of allocating millions of commands.
 * ------------------------------------------------------------------ */

const factorial = (n: number): bigint => {
  let result = 1n;
  for (let i = 2n; i <= BigInt(n); i++) result *= i;
  return result;
};

const choose = (n: number, k: number): bigint => {
  if (k < 0 || k > n) return 0n;
  let result = 1n;
  for (let i = 0n; i < BigInt(k); i++) {
    result = (result * (BigInt(n) - i)) / (i + 1n);
  }
  return result;
};

const subsetCount = (n: number, min: number, max: number): bigint => {
  let total = 0n;
  for (let k = min; k <= Math.min(max, n); k++) total += choose(n, k);
  return total;
};

/* ------------------------------------------------------------------ *
 * Generators
 * ------------------------------------------------------------------ */

/** All subsets of `values` with size in [min, max], in a stable order. */
const subsets = (values: string[], min: number, max: number): string[][] => {
  const out: string[][] = [];
  const build = (start: number, current: string[]) => {
    if (current.length >= min) out.push([...current]);
    if (current.length === max) return;
    for (let i = start; i < values.length; i++) {
      current.push(values[i]!);
      build(i + 1, current);
      current.pop();
    }
  };
  build(0, []);
  return out;
};

/** All permutations of `values`, in a stable order. */
const permutations = (values: string[]): string[][] => {
  if (values.length <= 1) return [[...values]];
  const out: string[][] = [];
  for (let i = 0; i < values.length; i++) {
    const rest = [...values.slice(0, i), ...values.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([values[i]!, ...tail]);
  }
  return out;
};

/**
 * Selection semantics per prompt kind. `orderCards` is order-SENSITIVE: the
 * engine requires a full permutation of the remainder, so treating it as a
 * subset would silently collapse distinct resolutions.
 */
const ORDER_SENSITIVE: ReadonlySet<ChoiceKind> = new Set<ChoiceKind>(["orderCards"]);
const SINGLE_OPTION: ReadonlySet<ChoiceKind> = new Set<ChoiceKind>(["confirm", "chooseOption"]);

const expandPrompt = (
  state: MatchState,
  prompt: PromptState,
  seat: MatchSeat,
  maxActions: number,
): EngineCommand[] => {
  // `enabled: false` marks an option the engine will refuse (a counter-step
  // card with no Counter value, for instance). Offering one would break both
  // SOUNDness and the promise that every expanded action is applicable.
  // Undefined means enabled.
  const optionIds = prompt.options
    .filter((option) => option.enabled !== false)
    .map((option) => option.id);
  const kind = prompt.choiceKind;
  const refuse = (requiredBranches: bigint) => {
    throw new ExpansionTooLargeError({
      promptId: prompt.id,
      kind: kind ?? prompt.kind,
      optionCount: optionIds.length,
      requiredBranches,
      maxActions,
    });
  };

  if (kind !== null && SINGLE_OPTION.has(kind)) {
    const count = BigInt(optionIds.length);
    if (count > BigInt(maxActions)) refuse(count);
    return optionIds.map((optionId) => ({
      type: "resolvePrompt",
      seat,
      promptId: prompt.id,
      optionId,
    }));
  }

  if (kind !== null && ORDER_SENSITIVE.has(kind)) {
    const count = factorial(optionIds.length);
    if (count > BigInt(maxActions)) refuse(count);
    return permutations(optionIds).map((selectedIds) => ({
      type: "resolvePrompt",
      seat,
      promptId: prompt.id,
      selectedIds,
    }));
  }

  // selectTargets / selectCards / costPayment, and any null choiceKind that
  // still carries min/max selection bounds: order-insensitive subsets.
  if (kind === null && prompt.options.length === 0) {
    throw new UnexpandableDescriptorError(
      `Prompt ${prompt.id} has no choiceKind and no options; refusing to guess a resolution.`,
    );
  }
  const min = Math.max(0, prompt.minSelections);
  const max = Math.min(prompt.maxSelections, optionIds.length);
  const count = subsetCount(optionIds.length, min, max);
  if (count > BigInt(maxActions)) refuse(count);

  // Context-level legality the descriptor cannot express. Delegated to the
  // engine's own authoritative predicate rather than re-implemented here, so
  // there is exactly one legality engine. The preflight count above is taken
  // BEFORE this filter, so it is conservative: it may refuse a prompt whose
  // valid resolutions would have fit, but it can never admit an oversized one.
  const context = prompt.resolutionContext;
  const legal =
    context?.intent === "effectPlaySelection"
      ? (selectedIds: string[]) => isValidPlaySelection(state, context, selectedIds)
      : () => true;

  return subsets(optionIds, min, max)
    .filter(legal)
    .map((selectedIds) => ({
      type: "resolvePrompt",
      seat,
      promptId: prompt.id,
      selectedIds,
    }));
};

export function expandDescriptor(
  state: MatchState,
  descriptor: LegalCommandDescriptor,
  options: ExpandOptions = {},
): EngineCommand[] {
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
  const seat = descriptor.seat;

  // Judge actions are out of scope for search: they are officiating, not play.
  if (seat === "judge") return [];
  const playerSeat = seat as MatchSeat;

  switch (descriptor.type) {
    case "concede":
    case "endTurn":
    case "mulligan":
    case "keepHand":
    case "startGame":
      return [{ type: descriptor.type, seat: playerSeat }];

    case "chooseJoKenPo": {
      // One descriptor per choice already; the choice is carried structurally
      // in `options`, never parsed from the label.
      const choice = descriptor.options?.[0]?.value;
      if (choice !== "rock" && choice !== "paper" && choice !== "scissors") {
        throw new UnexpandableDescriptorError(
          `chooseJoKenPo descriptor has no structured choice: ${JSON.stringify(descriptor)}`,
        );
      }
      return [{ type: "chooseJoKenPo", seat: playerSeat, choice: choice as JoKenPoChoice }];
    }

    case "chooseFirstPlayer": {
      const first = descriptor.targetIds?.[0];
      if (first !== "south" && first !== "north") {
        throw new UnexpandableDescriptorError(
          `chooseFirstPlayer descriptor has no seat: ${JSON.stringify(descriptor)}`,
        );
      }
      return [{ type: "chooseFirstPlayer", seat: playerSeat, firstPlayer: first }];
    }

    case "attachDon": {
      if (!descriptor.sourceId) {
        throw new UnexpandableDescriptorError("attachDon descriptor has no sourceId.");
      }
      return [{ type: "attachDon", seat: playerSeat, targetId: descriptor.sourceId }];
    }

    case "activateEffect": {
      if (!descriptor.sourceId) {
        throw new UnexpandableDescriptorError("activateEffect descriptor has no sourceId.");
      }
      return [
        {
          type: "activateEffect",
          seat: playerSeat,
          sourceInstanceId: descriptor.sourceId,
          trigger: "activateMain",
        },
      ];
    }

    case "playCard": {
      if (!descriptor.sourceId) {
        throw new UnexpandableDescriptorError("playCard descriptor has no sourceId.");
      }
      const slots = descriptor.slotChoices;
      // Slotless cards (events, stages) expand to a single command.
      if (!slots || slots.length === 0) {
        return [{ type: "playCard", seat: playerSeat, instanceId: descriptor.sourceId }];
      }
      if (BigInt(slots.length) > BigInt(maxActions)) {
        throw new ExpansionTooLargeError({
          promptId: null,
          kind: "playCard",
          optionCount: slots.length,
          requiredBranches: BigInt(slots.length),
          maxActions,
        });
      }
      return slots.map((slotIndex) => ({
        type: "playCard",
        seat: playerSeat,
        instanceId: descriptor.sourceId!,
        slotIndex,
      }));
    }

    case "declareAttack": {
      if (!descriptor.sourceId) {
        throw new UnexpandableDescriptorError("declareAttack descriptor has no sourceId.");
      }
      const targets = descriptor.targetIds ?? [];
      if (BigInt(targets.length) > BigInt(maxActions)) {
        throw new ExpansionTooLargeError({
          promptId: null,
          kind: "declareAttack",
          optionCount: targets.length,
          requiredBranches: BigInt(targets.length),
          maxActions,
        });
      }
      return targets.map((targetId) => ({
        type: "declareAttack",
        seat: playerSeat,
        attackerId: descriptor.sourceId!,
        targetId,
      }));
    }

    case "resolvePrompt": {
      const prompt = state.promptQueue.find((candidate) => candidate.id === descriptor.promptId);
      if (!prompt) {
        throw new UnexpandableDescriptorError(
          `resolvePrompt descriptor references unknown prompt ${descriptor.promptId}.`,
        );
      }
      return expandPrompt(state, prompt, playerSeat, maxActions);
    }

    default:
      throw new UnexpandableDescriptorError(
        `No expansion defined for descriptor type "${descriptor.type}".`,
      );
  }
}

/** The search branching surface: every concrete legal action for a seat. */
export function expandLegalActions(
  state: MatchState,
  seat: MatchSeat,
  options: ExpandOptions = {},
): EngineCommand[] {
  return getLegalCommands(state, seat).flatMap((descriptor) =>
    expandDescriptor(state, descriptor, options),
  );
}
