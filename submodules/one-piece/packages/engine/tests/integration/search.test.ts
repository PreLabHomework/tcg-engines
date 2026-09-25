import { describe, expect, test } from "vite-plus/test";
import type { EngineCommand, MatchSeat, MatchState } from "../../src/types.ts";
import { op16ShimotsukiUshimaru088, op17Jozu008, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { ExpansionTooLargeError } from "../../src/analysis/expand-actions.ts";
import { createSearchWorld, type SearchWorld } from "../../src/analysis/search-world.ts";
import { evaluatePosition, WIN_SCORE } from "../../src/analysis/evaluate.ts";
import { findLethal } from "../../src/analysis/lethal.ts";
import { search, searchFixedDepth, type LeafEvaluator } from "../../src/analysis/search.ts";

/**
 * 1C-3a/b/c: explicit-ownership minimax, iterative deepening, PV-first order.
 *
 * Scripted trees implement SearchWorld with an injected leaf evaluator, so
 * every minimax value is known exactly. Engine positions cover what must touch
 * real rules. Perspective is south throughout.
 */
type Tree =
  | { win: MatchSeat | "none" }
  | { value: number }
  | { mover: MatchSeat; moves: Record<string, Tree>; value?: number };

type ScriptedWorld = SearchWorld & { readonly staticValue: number };

const command = (seat: MatchSeat, label: string): EngineCommand =>
  ({ type: "declareAttack", seat, attackerId: label, targetId: label }) as EngineCommand;

const world = (tree: Tree): ScriptedWorld => ({
  state: { status: "active" } as MatchState,
  perspective: "south",
  staticValue: "value" in tree ? (tree.value ?? 0) : 0,
  seatToAct: () => ("mover" in tree ? tree.mover : "south"),
  isTerminal: () => "win" in tree,
  winner: () => ("win" in tree && tree.win !== "none" ? tree.win : null),
  legalActions: () =>
    "moves" in tree ? Object.keys(tree.moves).map((label) => command(tree.mover, label)) : [],
  apply: (action) => {
    if (!("moves" in tree)) throw new Error("apply on a node without moves");
    const label = (action as unknown as { attackerId: string }).attackerId;
    return { world: world(tree.moves[label]!), accepted: true, reason: null };
  },
  diagnosticFingerprint: () => "",
});

const scripted: LeafEvaluator = (w) => (w as ScriptedWorld).staticValue;
const label = (action: EngineCommand | null) =>
  action ? (action as unknown as { attackerId: string }).attackerId : null;

/** A south win after `n` further forced south moves. */
const winIn = (n: number): Tree =>
  n === 0 ? { win: "south" } : { mover: "south", moves: { step: winIn(n - 1) } };
/** A north win after `n` further forced south moves. */
const lossIn = (n: number): Tree =>
  n === 0 ? { win: "north" } : { mover: "south", moves: { step: lossIn(n - 1) } };

const solve = (tree: Tree, maxDepth: number) =>
  searchFixedDepth(world(tree), { maxDepth, evaluate: scripted });

/** Blocker position: forced mate in 3 against best defence. */
const blocker = () =>
  createSearchWorld(
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        character: [
          { card: op17Jozu008, playedOnTurn: 0 },
          { card: op17Jozu008, playedOnTurn: 0 },
        ],
        hand: [],
        life: 3,
      },
      {
        leaderCardId: op17RocksDXebec039,
        character: [{ card: op16ShimotsukiUshimaru088, playedOnTurn: 0 }],
        hand: [],
        life: 0,
      },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState(),
    "south",
  );

describe("general search: minimax by decision ownership", () => {
  test("1. terminal results dominate any evaluator score", () => {
    const toWin = solve({ mover: "south", moves: { eval: { value: 500_000 }, mate: winIn(0) } }, 1);
    expect(label(toWin.bestAction)).toBe("mate");
    expect(toWin.score).toBe(WIN_SCORE - 1);

    const toLose = solve(
      { mover: "south", moves: { bad: { value: -500_000 }, mated: { win: "north" } } },
      1,
    );
    // Any evaluation, however bad, beats walking into a loss.
    expect(label(toLose.bestAction)).toBe("bad");
  });

  test("2. depth 0 equals evaluator v0 exactly", () => {
    const w = blocker();
    const result = search(w, { maxDepth: 0 });
    expect(result.score).toBe(evaluatePosition(w, "south").total);
    expect(result.bestAction).toBeNull();
    expect(result.completedDepth).toBe(0);
    expect(result.status).toBe("complete");
  });

  test("3. a max node chooses the higher-evaluated child", () => {
    const result = solve({ mover: "south", moves: { a: { value: 10 }, b: { value: 20 } } }, 1);
    expect(label(result.bestAction)).toBe("b");
    expect(result.score).toBe(20);
  });

  test("4. an opponent node chooses the lower-scoring reply", () => {
    const result = solve({ mover: "north", moves: { a: { value: 10 }, b: { value: 20 } } }, 1);
    expect(label(result.bestAction)).toBe("a");
    expect(result.score).toBe(10);
  });

  test("5. consecutive same-seat decisions are max/max, not max/min by parity", () => {
    // `x` leads to ANOTHER south decision. Ownership says maximise again, giving
    // 50. Ply-parity negamax would minimise there, giving 5, and choose `y`.
    const tree: Tree = {
      mover: "south",
      moves: {
        x: { mover: "south", moves: { p: { value: 5 }, q: { value: 50 } } },
        y: { value: 30 },
      },
    };
    const result = solve(tree, 2);
    expect(label(result.bestAction)).toBe("x");
    expect(result.score).toBe(50);
    expect(result.principalVariation.map(label)).toEqual(["x", "q"]);
  });

  test("6. a mate in 3 is preferred over a mate in 5", () => {
    const result = solve({ mover: "south", moves: { slow: winIn(4), fast: winIn(2) } }, 6);
    expect(label(result.bestAction)).toBe("fast");
    expect(result.score).toBe(WIN_SCORE - 3);
  });

  test("7. a forced loss in 5 is preferred over a forced loss in 3", () => {
    const result = solve({ mover: "south", moves: { quick: lossIn(2), slow: lossIn(4) } }, 6);
    expect(label(result.bestAction)).toBe("slow");
    expect(result.score).toBe(-WIN_SCORE + 5);
  });
});

describe("iterative deepening", () => {
  const uniform = (depth: number, seed = 1): Tree =>
    depth === 0
      ? { value: (seed * 37) % 101 }
      : {
          mover: depth % 2 === 0 ? "south" : "north",
          moves: {
            a: uniform(depth - 1, seed * 3 + 1),
            b: uniform(depth - 1, seed * 3 + 2),
            c: uniform(depth - 1, seed * 3 + 3),
          },
          value: (seed * 13) % 97,
        };

  test("8. deepening 1 -> 3 matches a standalone depth-3 search", () => {
    const tree = uniform(6);
    // Unpruned, so every score is exact and move identity must match too.
    const deepened = search(world(tree), { maxDepth: 3, evaluate: scripted, pruning: "none" });
    const standalone = solve(tree, 3);

    expect(deepened.status).toBe("complete");
    expect(deepened.completedDepth).toBe(3);
    expect(deepened.score).toBe(standalone.score);
    expect(deepened.principalVariation).toEqual(standalone.principalVariation);
  });

  test("8b. the same holds on a real engine position, with and without ordering", () => {
    const standalone = searchFixedDepth(blocker(), { maxDepth: 3 });
    for (const ordering of ["pv-first", "none"] as const) {
      const deepened = search(blocker(), { maxDepth: 3, ordering, pruning: "none" });
      expect(deepened.score).toBe(standalone.score);
      expect(deepened.principalVariation).toEqual(standalone.principalVariation);
    }
  });

  test("9. running out of budget at depth 4 keeps the completed depth-3 answer", () => {
    // Uniform branching 3: iterations cost 4, 13, 40, 121 nodes, so cumulative
    // 57 after depth 3. A budget of 100 completes 1..3 and exhausts during 4.
    const tree = uniform(6);
    // Unpruned so the node arithmetic above is exact.
    const result = search(world(tree), {
      maxDepth: 6,
      evaluate: scripted,
      nodeBudget: 100,
      pruning: "none",
    });
    const depth3 = solve(tree, 3);

    expect(result.status).toBe("partial");
    expect(result.reason).toBe("node-budget");
    expect(result.completedDepth).toBe(3);
    expect(result.requestedDepth).toBe(6);
    // Not discarded: identical to the proven depth-3 result.
    expect(result.score).toBe(depth3.score);
    expect(result.principalVariation).toEqual(depth3.principalVariation);
  });

  test("an expansion refusal also yields partial with the last completed depth", () => {
    const refusing: SearchWorld = {
      ...world({ mover: "south", moves: { a: { value: 1 } } }),
      legalActions: () => {
        throw new ExpansionTooLargeError({
          promptId: "scripted",
          kind: "orderCards",
          optionCount: 20,
          requiredBranches: 10n ** 18n,
          maxActions: 100_000,
        });
      },
    };
    const result = search(refusing, { maxDepth: 3, evaluate: scripted });
    expect(result.status).toBe("partial");
    expect(result.reason).toBe("expansion-too-large");
    expect(result.completedDepth).toBe(0);
    expect(result.bestAction).toBeNull();
  });
});

describe("1C-3d: alpha-beta", () => {
  /** Deterministic pseudo-random trees with deliberately frequent ties. */
  const randomTree = (depth: number, seed: number, owners: string): Tree => {
    let s = seed;
    const next = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s;
    };
    const build = (d: number, ply: number): Tree => {
      if (d === 0) return { value: next() % 7 };
      const mover = owners[ply % owners.length] === "S" ? "south" : "north";
      const width = 2 + (next() % 3);
      return {
        mover,
        value: next() % 7,
        moves: Object.fromEntries(
          Array.from({ length: width }, (_, i) => [`m${i}`, build(d - 1, ply + 1)]),
        ),
      };
    };
    return build(depth, 0);
  };

  /** The exact minimax value of a move, independent of the search under test. */
  const valueOf = (tree: Tree, depth: number, move: string) => {
    if (!("moves" in tree)) throw new Error("no moves");
    return solve(tree.moves[move]!, depth - 1).score;
  };

  test("the root score equals plain minimax on many trees, including ties", () => {
    // Owner patterns include same-seat runs, not just strict alternation.
    for (const owners of ["SN", "SSN", "SNN", "SSNN", "NSSN"]) {
      for (let seed = 1; seed <= 25; seed++) {
        const tree = randomTree(5, seed, owners);
        const reference = solve(tree, 5);
        const pruned = search(world(tree), { maxDepth: 5, evaluate: scripted });
        expect({ owners, seed, score: pruned.score }).toEqual({
          owners,
          seed,
          score: reference.score,
        });
      }
    }
  });

  test("the chosen move genuinely achieves the root score", () => {
    // Among equally-good moves alpha-beta may pick a different one than plain
    // minimax. What it must never do is pick a move WORSE than the root value.
    for (const owners of ["SN", "SSN", "SNN"]) {
      for (let seed = 1; seed <= 25; seed++) {
        const tree = randomTree(5, seed, owners);
        const pruned = search(world(tree), { maxDepth: 5, evaluate: scripted });
        expect(valueOf(tree, 5, label(pruned.bestAction)!)).toBe(pruned.score);
      }
    }
  });

  test("the PV ends in a position whose value is the root score", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const tree = randomTree(4, seed, "SSN");
      const result = search(world(tree), { maxDepth: 4, evaluate: scripted });
      let node: Tree = tree;
      for (const action of result.principalVariation) {
        if (!("moves" in node)) break;
        node = node.moves[label(action)!]!;
      }
      expect(scripted(world(node), "south")).toBe(result.score);
    }
  });

  test("pruning never increases the node count, and is deterministic", () => {
    const tree = randomTree(6, 7, "SN");
    const plain = search(world(tree), { maxDepth: 6, evaluate: scripted, pruning: "none" });
    const pruned = search(world(tree), { maxDepth: 6, evaluate: scripted });
    const again = search(world(tree), { maxDepth: 6, evaluate: scripted });

    expect(pruned.searchedNodes).toBeLessThanOrEqual(plain.searchedNodes);
    expect(again).toEqual(pruned);
  });
});

describe("general search on the engine", () => {
  test("10. the principal variation replays entirely through legalActions()", () => {
    const root = blocker();
    const result = search(root, { maxDepth: 3 });

    let node: SearchWorld = root;
    for (const action of result.principalVariation) {
      expect(node.legalActions(node.seatToAct()).map((a) => JSON.stringify(a))).toContain(
        JSON.stringify(action),
      );
      const step = node.apply(action);
      expect(step.accepted).toBe(true);
      node = step.world;
    }
  });

  test("the mate score agrees with the lethal solver's best-defence distance", () => {
    // Two independent systems, one question: they must agree on the mate.
    const lethal = findLethal(blocker(), { maxPlies: 3 });
    const general = search(blocker(), { maxDepth: 3 });

    expect(lethal.status).toBe("forced-win");
    if (lethal.status !== "forced-win") return;
    expect(general.score).toBe(WIN_SCORE - lethal.plies);
    expect(general.principalVariation).toHaveLength(lethal.plies);
  });
});
