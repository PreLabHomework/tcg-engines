import { describe, expect, test } from "vite-plus/test";
import { op12Fullbody052, op17CharlotteLinlin049, op17RocksDXebec039 } from "@tcg/op-cards";

import { OnePieceTestEngine } from "../../src/index.ts";
import { createSearchWorld, seatToAct } from "../../src/analysis/search-world.ts";

/**
 * Decision ownership.
 *
 * Search quantification follows whoever owns the next decision, not whose
 * turn it is. OP17-049 Charlotte Linlin's [On Play] is the concrete case:
 * the OPPONENT chooses, during our turn. A solver that equated "our turn"
 * with "existential node" would treat that choice as ours and manufacture
 * forced wins that do not exist.
 */
describe("seatToAct follows the decision, not the turn", () => {
  const setup = () =>
    OnePieceTestEngine.create(
      {
        leaderCardId: op17RocksDXebec039,
        hand: [{ card: op17CharlotteLinlin049 }],
        deck: [op12Fullbody052, op12Fullbody052, op12Fullbody052],
        activeDon: 10,
        life: 3,
      },
      {
        hand: [{ card: op12Fullbody052 }, { card: op12Fullbody052 }],
        life: 3,
      },
      { firstPlayer: "south", activeSeat: "south" },
    );

  test("with no pending prompt, the active seat acts", () => {
    const engine = setup();
    const state = engine.getState();
    expect(state.promptQueue.filter((prompt) => prompt.status === "pending")).toEqual([]);
    expect(seatToAct(state)).toBe(state.activeSeat);
  });

  test("an opponent-owned prompt during our turn hands the decision to them", () => {
    const engine = setup();
    engine.play(op17CharlotteLinlin049, "south");

    const state = engine.getState();
    // Our turn...
    expect(state.activeSeat).toBe("south");
    // ...but the decision is the opponent's.
    expect(seatToAct(state)).toBe("north");

    const world = createSearchWorld(state, "south");
    expect(world.seatToAct()).toBe("north");

    // legalActions() must follow ownership, not the turn. Every action
    // offered belongs to north, and they are the prompt resolutions.
    const actions = world.legalActions();
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.seat).toBe("north");
    }
    // Concession is legal for either player at any time (1-2-3), so it also
    // appears here. Setting aside that meta action, everything offered is a
    // resolution of the opponent's prompt.
    const play = actions.filter((action) => action.type !== "concede");
    expect(play.length).toBeGreaterThan(0);
    expect(play.every((action) => action.type === "resolvePrompt")).toBe(true);
  });

  test("once the prompt resolves, the decision returns to the active seat", () => {
    const engine = setup();
    engine.play(op17CharlotteLinlin049, "south");
    engine.resolveDecision("effectActionChoice", { optionId: "0" }, "north");

    const state = engine.getState();
    expect(state.promptQueue.filter((prompt) => prompt.status === "pending")).toEqual([]);
    expect(seatToAct(state)).toBe("south");
    expect(createSearchWorld(state, "south").seatToAct()).toBe("south");
  });
});
