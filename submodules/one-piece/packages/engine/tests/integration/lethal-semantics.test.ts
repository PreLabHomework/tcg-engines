import { describe, expect, test } from "vite-plus/test";
import type { EngineCommand, MatchSeat, MatchState } from "../../src/types.ts";

import { ExpansionTooLargeError } from "../../src/analysis/expand-actions.ts";
import type { SearchWorld } from "../../src/analysis/search-world.ts";
import { findLethal } from "../../src/analysis/lethal.ts";

/**
 * Solver semantics on scripted game trees.
 *
 * These trees implement the SearchWorld interface directly, so every minimax
 * value is known exactly and the solver's combination logic is tested in
 * isolation from the engine. Engine positions cannot cleanly produce shapes
 * like "a refused branch beside a proven win".
 *
 * Perspective is always south.
 */
type Tree =
  | { win: MatchSeat | "none" }
  | { refuse: true; mover: MatchSeat }
  | { mover: MatchSeat; moves: Record<string, Tree> };

const command = (seat: MatchSeat, label: string): EngineCommand =>
  ({ type: "declareAttack", seat, attackerId: label, targetId: label }) as EngineCommand;

const world = (tree: Tree): SearchWorld => ({
  state: { status: "active" } as MatchState,
  perspective: "south",
  seatToAct: () => ("mover" in tree ? tree.mover : "south"),
  isTerminal: () => "win" in tree,
  winner: () => ("win" in tree && tree.win !== "none" ? tree.win : null),
  legalActions: () => {
    if ("refuse" in tree) {
      throw new ExpansionTooLargeError({
        promptId: "scripted",
        kind: "orderCards",
        optionCount: 20,
        requiredBranches: 2432902008176640000n,
        maxActions: 100_000,
      });
    }
    if ("moves" in tree) return Object.keys(tree.moves).map((label) => command(tree.mover, label));
    return [];
  },
  apply: (action) => {
    if (!("moves" in tree)) throw new Error("apply on a node without moves");
    const label = (action as unknown as { attackerId: string }).attackerId;
    return { world: world(tree.moves[label]!), accepted: true, reason: null };
  },
  diagnosticFingerprint: () => "",
});

const WIN: Tree = { win: "south" };
const LOSS: Tree = { win: "north" };
/** A south win reached after `n` further plies of forced south moves. */
const winIn = (n: number): Tree =>
  n === 0 ? WIN : { mover: "south", moves: { step: winIn(n - 1) } };
const REFUSED: Tree = { refuse: true, mover: "south" };

const solve = (tree: Tree, maxPlies = 20) => findLethal(world(tree), { maxPlies });
const labels = (line: readonly EngineCommand[]) =>
  line.map((action) => (action as unknown as { attackerId: string }).attackerId);

describe("mate distance against best defence", () => {
  test("our node takes the SHORTEST forced win, whatever order it visits", () => {
    // `slow` is visited first and wins in 5; `fast` wins in 2.
    const tree: Tree = { mover: "south", moves: { slow: winIn(4), fast: winIn(1) } };
    const result = solve(tree);

    expect(result.status).toBe("forced-win");
    if (result.status !== "forced-win") return;
    expect(result.plies).toBe(2);
    expect(labels(result.line)[0]).toBe("fast");
  });

  test("the opponent's node reports the LONGEST defence, not the first visited", () => {
    // Every reply loses. `quick` is visited first and loses in 1 more ply;
    // `stubborn` holds out for 5. Best defence is `stubborn`.
    const tree: Tree = {
      mover: "north",
      moves: { quick: winIn(0), medium: winIn(2), stubborn: winIn(4) },
    };
    const result = solve(tree);

    expect(result.status).toBe("forced-win");
    if (result.status !== "forced-win") return;
    expect(labels(result.line)[0]).toBe("stubborn");
    expect(result.plies).toBe(5);
  });

  test("minimax composes: shortest over our choices, longest over theirs", () => {
    // attackA: they can defend for 4 more.  attackB: they can defend for 2.
    const tree: Tree = {
      mover: "south",
      moves: {
        attackA: { mover: "north", moves: { d1: winIn(1), d2: winIn(3) } },
        attackB: { mover: "north", moves: { d1: winIn(1), d2: winIn(1) } },
      },
    };
    const result = solve(tree);

    expect(result.status).toBe("forced-win");
    if (result.status !== "forced-win") return;
    // attackB: 1 (ours) + 1 (their reply) + 1 (our finisher) = 3.
    expect(labels(result.line)[0]).toBe("attackB");
    expect(result.plies).toBe(3);
  });

  // A general invariant rather than a regression detector: in this tree the
  // first-visited path is also the optimal one, so the pre-fix solver passed it
  // too. The three tests above are the ones that catch visit-order bugs.
  test("mate distance equals the minimal depth at which a win is forced", () => {
    const tree: Tree = {
      mover: "south",
      moves: {
        attackA: { mover: "north", moves: { d1: winIn(1), d2: winIn(3) } },
        attackB: { mover: "north", moves: { d1: winIn(1), d2: winIn(1) } },
      },
    };
    const minimal = [1, 2, 3, 4, 5, 6].find((depth) => solve(tree, depth).status === "forced-win");
    const deep = solve(tree, 20);

    expect(minimal).toBe(3);
    if (deep.status === "forced-win") expect(deep.plies).toBe(minimal);
  });
});

describe("three-valued combination", () => {
  test("our node: a proven win survives a refused sibling", () => {
    const tree: Tree = { mover: "south", moves: { refused: REFUSED, lethal: winIn(1) } };
    expect(solve(tree).status).toBe("forced-win");
  });

  test("our node: refused plus no-win is indeterminate, not a negative", () => {
    const tree: Tree = { mover: "south", moves: { refused: REFUSED, dud: LOSS } };
    const result = solve(tree);
    expect(result.status).toBe("indeterminate");
    if (result.status === "indeterminate") expect(result.reason).toBe("expansion-too-large");
  });

  test("our node: all no-win is a genuine no-forced-win", () => {
    const tree: Tree = { mover: "south", moves: { a: LOSS, b: LOSS } };
    expect(solve(tree).status).toBe("no-forced-win");
  });

  test("opponent node: one known escape refutes the win despite a refused sibling", () => {
    const tree: Tree = { mover: "north", moves: { refused: REFUSED, escape: LOSS } };
    expect(solve(tree).status).toBe("no-forced-win");
  });

  test("opponent node: refused plus wins is indeterminate", () => {
    const tree: Tree = { mover: "north", moves: { lose: winIn(0), refused: REFUSED } };
    const result = solve(tree);
    expect(result.status).toBe("indeterminate");
  });

  test("opponent node: every reply losing is a forced win", () => {
    const tree: Tree = { mover: "north", moves: { a: winIn(0), b: winIn(2) } };
    expect(solve(tree).status).toBe("forced-win");
  });

  test("a win proven before the budget runs out is not discarded", () => {
    // A long win is found first, so the solver keeps searching siblings for a
    // SHORTER mate. That continued search is what can exhaust the budget, and
    // the win already in hand must survive it.
    //
    // Deliberately a long first win: a short one would tighten the depth limit
    // so far that the sink is never explored and the budget never binds.
    const wide = (depth: number): Tree =>
      depth === 0
        ? LOSS
        : {
            mover: "south",
            moves: Object.fromEntries(
              Array.from({ length: 6 }, (_, i) => [`m${i}`, wide(depth - 1)]),
            ),
          };
    const tree: Tree = { mover: "south", moves: { lethal: winIn(6), sink: wide(6) } };
    const nodeBudget = 20;
    const result = findLethal(world(tree), { maxPlies: 20, nodeBudget });

    // The budget genuinely ran out during the continued search. The solver
    // stops AT the budget rather than overshooting it, because it checks
    // before applying each child...
    expect(result.searchedNodes).toBeGreaterThanOrEqual(nodeBudget);
    // ...and the proven win was kept rather than downgraded to indeterminate.
    expect(result.status).toBe("forced-win");
    if (result.status === "forced-win") expect(result.plies).toBe(7);
  });

  test("with no win anywhere, exhausting the budget is indeterminate", () => {
    const wide = (depth: number): Tree =>
      depth === 0 ? LOSS : { mover: "south", moves: { a: wide(depth - 1), b: wide(depth - 1) } };
    const result = findLethal(world(wide(10)), { maxPlies: 20, nodeBudget: 10 });

    expect(result.status).toBe("indeterminate");
    if (result.status === "indeterminate") expect(result.reason).toBe("node-budget");
  });
});
