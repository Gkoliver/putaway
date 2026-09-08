import { describe, expect, it } from "vitest";
import { interpretTranscript, parseInterpreterOutput } from "./interpreter";

const fixtures: Array<{ transcript: string; llm: unknown; expected: unknown }> = [
  {
    transcript: "I'm putting paper towels in the basement",
    llm: { intent: "put_away", itemText: "paper towels", locationPath: ["basement"] },
    expected: {
      intent: "put_away",
      itemText: "paper towels",
      quantity: 1,
      locationPath: ["basement"],
    },
  },
  {
    transcript: "I'm putting paper towels on the shelf a on the metal shelves in the basement",
    llm: {
      intent: "put_away",
      itemText: "paper towels",
      locationPath: ["basement", "metal shelves", "shelf a"],
    },
    expected: {
      intent: "put_away",
      itemText: "paper towels",
      quantity: 1,
      locationPath: ["basement", "metal shelves", "shelf a"],
    },
  },
  {
    transcript: "where are the paper towels",
    llm: { intent: "find", itemText: "paper towels" },
    expected: { intent: "find", itemText: "paper towels", quantity: 1 },
  },
  {
    transcript: "where do we normally store paper towels",
    llm: { intent: "find_usual", itemText: "paper towels" },
    expected: { intent: "find_usual", itemText: "paper towels", quantity: 1 },
  },
  {
    transcript: "I took two paper towels",
    llm: { intent: "take_out", itemText: "paper towels", quantity: 2 },
    expected: { intent: "take_out", itemText: "paper towels", quantity: 2 },
  },
  {
    transcript: "putting paper towel downstairs",
    llm: { intent: "put_away", itemText: "paper towel", locationPath: ["downstairs"] },
    expected: {
      intent: "put_away",
      itemText: "paper towel",
      quantity: 1,
      locationPath: ["downstairs"],
    },
  },
];

describe("parseInterpreterOutput", () => {
  it("maps LLM JSON to commands with default quantity", () => {
    for (const f of fixtures) {
      expect(parseInterpreterOutput(f.llm)).toEqual(f.expected);
    }
  });

  it("asks a follow-up when item is missing", () => {
    expect(parseInterpreterOutput({ intent: "find" })).toMatchObject({ type: "follow_up" });
  });
});

describe("interpretTranscript", () => {
  it("does not call extract on empty audio transcript", async () => {
    let called = false;
    const result = await interpretTranscript("   ", async () => {
      called = true;
      return {};
    });
    expect(called).toBe(false);
    expect(result).toMatchObject({ type: "error", code: "empty_transcript" });
  });

  it("maps voice_unavailable when extract throws", async () => {
    const result = await interpretTranscript("hello", async () => {
      throw new Error("openai down");
    });
    expect(result).toMatchObject({ type: "error", code: "voice_unavailable" });
  });

  it("runs fixtures through extract", async () => {
    for (const f of fixtures) {
      const result = await interpretTranscript(f.transcript, async () => f.llm);
      expect(result).toEqual(f.expected);
    }
  });
});
