import { describe, expect, test } from "vite-plus/test";
import type { MatchSeat } from "../../src/types.ts";
import {
  op16Nami091,
  op16ShimotsukiUshimaru088,
  op17CharlotteLinlin049,
  op17Jozu008,
  op17RocksDXebec039,
} from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { createSearchWorld, type SearchWorld } from "../../src/analysis/search-world.ts";
import { findLethal, type LethalResult } from "../../src/analysis/lethal.ts";

/**
 * Bounded lethal solver: synthetic fixtures with mathematically known answers.
 *
 * Positions are built directly rather than replayed, because the point is a
 * known answer, not a plausible history. They still use real cards and real
 * rules; they are simply not required to be reachable through 80 commands.
 */
const LEADER = op17RocksDXebec039;

/**
 * THE critical invariant: replay a winning line one command at a time and
 * assert each command was genuinely available at that node, and that the line
 * actually reaches a terminal win for the perspective player. This is what
 * stops the solver constructing legal-looking commands by hand.
 */
const assertLineIsLegalAndWins = (
  world: SearchWorld,
  result: LethalResult,
  perspective: MatchSeat,
) => {
  expect(result.status).toBe("forced-win");
  if (result.status !== "forced-win") return;

  let node = world;
  for (const command of result.line) {
    const available = node.legalActions(node.seatToAct());
    expect(available.map((action) => JSON.stringify(action))).toContain(JSON.stringify(command));
    const step = node.apply(command);
    expect(step.accepted).toBe(true);
    node = step.world;
  }
  expect(node.isTerminal()).toBe(true);
  expect(node.winner()).toBe(perspective);
  expect(result.plies).toBe(result.line.length);
};

describe("bounded lethal solver", () => {
  test("fixture 1: undefended lethal is found", () => {
    // North is at 0 Life with no hand and no board: any connecting attack ends it.
    const state = OnePieceTestEngine.create(
      {
        leaderCardId: LEADER,
        character: [{ card: op17Jozu008, playedOnTurn: 0 }],
        hand: [],
        life: 3,
      },
      { leaderCardId: LEADER, hand: [], life: 0 },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState();
    const world = createSearchWorld(state, "south");

    const result = findLethal(world, { maxPlies: 4 });

    expect(result.status).toBe("forced-win");
    assertLineIsLegalAndWins(world, result, "south");
  });

  test("fixture 2: a sufficient counter refutes the attack", () => {
    // South can only attack with its 5000 Leader. North holds a 1000 Counter,
    // which lifts its 5000 Leader out of range, so nothing is forced.
    const state = OnePieceTestEngine.create(
      { leaderCardId: LEADER, hand: [], life: 3 },
      { leaderCardId: LEADER, hand: [{ card: op16Nami091 }], life: 0 },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState();

    const result = findLethal(createSearchWorld(state, "south"), { maxPlies: 3 });

    expect(result.status).toBe("no-forced-win");
    if (result.status === "no-forced-win") expect(result.depthLimit).toBe(3);
  });

  test("fixture 3: a blocker is answered, every defensive reply still loses", () => {
    // Two 8000 attackers against one 2000 Blocker and a Leader at 0 Life.
    // Blocking trades the Blocker and the second attack finishes; declining
    // loses to the first. Both branches must be searched.
    const state = OnePieceTestEngine.create(
      {
        leaderCardId: LEADER,
        character: [
          { card: op17Jozu008, playedOnTurn: 0 },
          { card: op17Jozu008, playedOnTurn: 0 },
        ],
        hand: [],
        life: 3,
      },
      {
        leaderCardId: LEADER,
        character: [{ card: op16ShimotsukiUshimaru088, playedOnTurn: 0 }],
        hand: [],
        life: 0,
      },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState();
    const world = createSearchWorld(state, "south");

    // Forced at 3 plies: attack, the block decision, then the follow-up.
    const result = findLethal(world, { maxPlies: 3 });

    expect(result.status).toBe("forced-win");
    assertLineIsLegalAndWins(world, result, "south");
    if (result.status !== "forced-win") return;

    // The line is a principal variation against BEST defence. Declining the
    // block loses immediately, so the stubborn reply is to block, and that is
    // what the line must show. The pre-fix solver reported the first-visited
    // reply (no block) and a mate distance of 2.
    expect(result.plies).toBe(3);
    const reply = result.line[1] as { type: string; seat: string; selectedIds?: string[] };
    expect(reply.type).toBe("resolvePrompt");
    expect(reply.seat).toBe("north");
    expect(reply.selectedIds?.length).toBe(1);
  });

  test("fixture 4: depth sensitivity, no win shallow, win deeper", () => {
    const state = OnePieceTestEngine.create(
      {
        leaderCardId: LEADER,
        character: [
          { card: op17Jozu008, playedOnTurn: 0 },
          { card: op17Jozu008, playedOnTurn: 0 },
        ],
        hand: [],
        life: 3,
      },
      {
        leaderCardId: LEADER,
        character: [{ card: op16ShimotsukiUshimaru088, playedOnTurn: 0 }],
        hand: [],
        life: 0,
      },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState();
    const world = createSearchWorld(state, "south");

    // Too shallow: the Blocker absorbs the first attack and the horizon ends
    // before the follow-up. This is a legitimate negative, not indeterminate.
    expect(findLethal(world, { maxPlies: 1 }).status).toBe("no-forced-win");
    expect(findLethal(world, { maxPlies: 2 }).status).toBe("no-forced-win");
    // One ply deeper, the block and the follow-up both fit: forced.
    expect(findLethal(world, { maxPlies: 3 }).status).toBe("forced-win");
  });

  test("fixture 5: an opponent-owned prompt during our turn is quantified universally", () => {
    // OP17-049 Linlin's [On Play] is the OPPONENT's choice, on OUR turn. The
    // solver must treat it as a universal node via seatToAct(), not as ours.
    const state = OnePieceTestEngine.create(
      {
        leaderCardId: LEADER,
        character: [{ card: op17Jozu008, playedOnTurn: 0 }],
        hand: [{ card: op17CharlotteLinlin049 }],
        deck: [op17Jozu008, op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { leaderCardId: LEADER, hand: [], life: 0 },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState();
    const world = createSearchWorld(state, "south");

    const result = findLethal(world, { maxPlies: 6 });

    // Lethal exists regardless of what the opponent chooses.
    expect(result.status).toBe("forced-win");
    assertLineIsLegalAndWins(world, result, "south");
  });

  test("fixture 6: the node budget yields indeterminate, never a false negative", () => {
    const state = OnePieceTestEngine.create(
      {
        leaderCardId: LEADER,
        character: [
          { card: op17Jozu008, playedOnTurn: 0 },
          { card: op17Jozu008, playedOnTurn: 0 },
        ],
        hand: [{ card: op17CharlotteLinlin049 }],
        deck: [op17Jozu008, op17Jozu008],
        activeDon: 10,
        life: 3,
      },
      { leaderCardId: LEADER, hand: [{ card: op16Nami091 }], life: 2 },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState();

    const result = findLethal(createSearchWorld(state, "south"), {
      maxPlies: 12,
      nodeBudget: 25,
    });

    // Running out of budget must NOT be reported as "no forced win".
    expect(result.status).toBe("indeterminate");
    if (result.status === "indeterminate") expect(result.reason).toBe("node-budget");
  });

  test("setup positions are rejected rather than silently searched", () => {
    const setup = OnePieceTestEngine.create({}, {}, { skipSetup: false }).getState();
    if (setup.status !== "active") {
      expect(() => findLethal(createSearchWorld(setup, "south"), { maxPlies: 2 })).toThrow(
        /in-progress gameplay position/,
      );
    }
  });

  test("concede is excluded, so a forced win is forced through gameplay", () => {
    const state = OnePieceTestEngine.create(
      { leaderCardId: LEADER, hand: [], life: 3 },
      { leaderCardId: LEADER, hand: [{ card: op16Nami091 }], life: 0 },
      { firstPlayer: "south", activeSeat: "south" },
    ).getState();
    const world = createSearchWorld(state, "south");

    // Concession is legal for both seats at every node...
    expect(world.legalActions().some((action) => action.type === "concede")).toBe(true);
    // ...but the opponent surrendering must never count as a forced win.
    const result = findLethal(world, { maxPlies: 3 });
    expect(result.status).toBe("no-forced-win");
  });
});
