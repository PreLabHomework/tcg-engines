import { describe, expect, test } from "vite-plus/test";
import type { EngineCommand, MatchSeat, MatchState } from "../../src/types.ts";

import { applyCommand, createMatch } from "../../src/core.ts";
import { getLegalCommands } from "../../src/engine/legal.ts";
import { seatToAct } from "../../src/analysis/search-world.ts";
import { ExpansionTooLargeError, expandDescriptor } from "../../src/analysis/expand-actions.ts";
import { runBotMatch } from "../../src/automation/bot-harness.ts";
import { heuristicAgent } from "../../src/automation/heuristic-strategy.ts";
import { MAX_COMMANDS, matchConfig, type DeckId } from "./deck-fixtures.ts";
import "@tcg/op-cards";

/**
 * Expansion soundness audit. OPT-IN: set OPTCG_EXPANSION_AUDIT=1.
 *
 * Contract under test: expandLegalActions(state, seat) returns ONLY commands
 * the engine accepts. A rejected expanded command means action enumeration
 * disagrees with engine legality, which is an engine/search interface bug.
 *
 * Why this exists: two soundness bugs (disabled prompt options, and
 * OP17-118's set-level selectionTotal constraint) were found only by real
 * positions. Synthetic tests missed both. This walks deterministic Phase 0
 * transcripts and, at every state, applies every expanded action.
 *
 * It COLLECTS every rejection rather than failing on the first, and groups
 * them by prompt intent / choice kind / source card, so the extraction scope
 * of any fix is decided by evidence rather than guessed.
 *
 * Expansion refusals (ExpansionTooLargeError) are recorded separately: a
 * refusal is honest, an unsound action is not.
 *
 * Process note, recorded deliberately: a previous investigation mistook a
 * thrown error for a hang because only the investigator's own log lines were
 * being grepped. Filtered diagnostic output is not evidence that a process is
 * still running. Read raw exit status and error output first, theorise second.
 */
const ENABLED = process.env.OPTCG_EXPANSION_AUDIT === "1";

interface Rejection {
  game: string;
  cut: number;
  turn: number;
  seatToAct: MatchSeat;
  descriptorType: string;
  intent: string;
  choiceKind: string;
  source: string;
  reason: string | null;
  command: EngineCommand;
}

interface Refusal {
  game: string;
  cut: number;
  kind: string;
  requiredBranches: string;
}

const DECK_IDS: readonly DeckId[] = ["newgate", "yamato", "xebec"];
const GAMES = DECK_IDS.flatMap((south) =>
  DECK_IDS.flatMap((north) =>
    (["south", "north"] as const).map((first) => ({ south, north, first })),
  ),
);

const promptFacts = (state: MatchState, command: EngineCommand) => {
  if (command.type !== "resolvePrompt")
    return { intent: command.type, choiceKind: "-", source: "-" };
  const prompt = state.promptQueue.find((candidate) => candidate.id === command.promptId);
  const context = prompt?.resolutionContext as { intent?: string } | null | undefined;
  return {
    intent: context?.intent ?? prompt?.kind ?? "unknown",
    choiceKind: prompt?.choiceKind ?? "null",
    source: prompt?.sourceCardId ?? "-",
  };
};

describe.skipIf(!ENABLED)("expansion soundness audit (opt-in)", () => {
  test("every expanded action at every transcript state is accepted", () => {
    const rejections: Rejection[] = [];
    const refusals: Refusal[] = [];
    let statesAudited = 0;
    let actionsChecked = 0;

    for (const { south, north, first } of GAMES) {
      const seed = `audit:${south}-vs-${north}:first-${first}`;
      const game = `${south}->${north} first=${first}`;
      const config = matchConfig(south, north, seed, first);
      const live = runBotMatch(
        config,
        { south: heuristicAgent, north: heuristicAgent },
        { maxCommands: MAX_COMMANDS, seed },
      );

      // Walk forward once, auditing each state before its command is applied.
      let state = createMatch(config);
      for (let cut = 0; cut <= live.commandHistory.length; cut++) {
        if (state.status !== "finished") {
          statesAudited++;
          const seat = seatToAct(state);
          for (const descriptor of getLegalCommands(state, seat)) {
            let expanded: EngineCommand[];
            try {
              expanded = expandDescriptor(state, descriptor);
            } catch (error) {
              if (error instanceof ExpansionTooLargeError) {
                refusals.push({
                  game,
                  cut,
                  kind: error.kind,
                  requiredBranches: error.requiredBranches.toString(),
                });
                continue;
              }
              throw error;
            }
            for (const command of expanded) {
              actionsChecked++;
              const result = applyCommand(state, command);
              if (!result.accepted) {
                rejections.push({
                  game,
                  cut,
                  turn: state.turnNumber,
                  seatToAct: seat,
                  descriptorType: descriptor.type,
                  ...promptFacts(state, command),
                  reason: result.reason,
                  command,
                });
              }
            }
          }
        }
        const next = live.commandHistory[cut];
        if (!next) break;
        state = applyCommand(state, next).state;
      }
    }

    // Group so the fix's scope is chosen from evidence.
    const groups = new Map<string, { count: number; example: Rejection }>();
    for (const rejection of rejections) {
      const key = `${rejection.intent} | ${rejection.choiceKind} | ${rejection.source} | ${rejection.reason}`;
      const entry = groups.get(key);
      if (entry) entry.count++;
      else groups.set(key, { count: 1, example: rejection });
    }

    // eslint-disable-next-line no-console
    console.log(
      `AUDIT games=${GAMES.length} states=${statesAudited} actions=${actionsChecked} ` +
        `rejections=${rejections.length} refusals=${refusals.length} groups=${groups.size}`,
    );
    for (const [key, { count, example }] of groups) {
      // eslint-disable-next-line no-console
      console.log(
        `AUDIT group x${count}: ${key}\n  e.g. ${example.game} cut=${example.cut} ` +
          `turn=${example.turn} ${JSON.stringify(example.command)}`,
      );
    }
    for (const refusal of refusals.slice(0, 5)) {
      // eslint-disable-next-line no-console
      console.log(`AUDIT refusal ${JSON.stringify(refusal)}`);
    }

    expect(rejections).toEqual([]);
  }, 1_200_000);
});
