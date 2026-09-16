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

  it("maps voice_unavailable when extract throws on unparseable text", async () => {
    const result = await interpretTranscript("hello", async () => {
      throw new Error("openai down");
    });
    expect(result).toMatchObject({ type: "error", code: "voice_unavailable" });
  });

  it("falls back to a spoken parse when extract throws on a put-away sentence", async () => {
    const result = await interpretTranscript(
      "I'm putting paper towels in the basement",
      async () => {
        throw new Error("openai down");
      },
    );
    expect(result).toEqual({
      intent: "put_away",
      itemText: "paper towels",
      quantity: 1,
      locationPath: ["basement"],
    });
  });

  it("treats 'item in location' as put-away when extract throws", async () => {
    const result = await interpretTranscript(
      "Dishwasher detergent in the basement cabinet",
      async () => {
        throw new Error("openai down");
      },
    );
    expect(result).toEqual({
      intent: "put_away",
      itemText: "Dishwasher detergent",
      quantity: 1,
      locationPath: ["basement cabinet"],
    });
  });

  it("parses a leading digit as quantity on put-away when extract throws", async () => {
    const result = await interpretTranscript("8 hats in the right foyer cabinet", async () => {
      throw new Error("openai down");
    });
    expect(result).toEqual({
      intent: "put_away",
      itemText: "hats",
      quantity: 8,
      locationPath: ["right foyer cabinet"],
    });
  });

  it("strips put-away lead-in from the item name when extract throws", async () => {
    const result = await interpretTranscript(
      "I put dishwasher detergent in the basement cabinet",
      async () => {
        throw new Error("openai down");
      },
    );
    expect(result).toEqual({
      intent: "put_away",
      itemText: "dishwasher detergent",
      quantity: 1,
      locationPath: ["basement cabinet"],
    });
  });

  it("parses a spoken word quantity on put-away when extract throws", async () => {
    const result = await interpretTranscript(
      "I'm putting two paper towels in the basement",
      async () => {
        throw new Error("openai down");
      },
    );
    expect(result).toEqual({
      intent: "put_away",
      itemText: "paper towels",
      quantity: 2,
      locationPath: ["basement"],
    });
  });

  it("keeps three-digit product names as the item when extract throws", async () => {
    const result = await interpretTranscript("409 cleaner in the garage", async () => {
      throw new Error("openai down");
    });
    expect(result).toEqual({
      intent: "put_away",
      itemText: "409 cleaner",
      quantity: 1,
      locationPath: ["garage"],
    });
  });

  it("keeps room-first order for 'in the basement on the shelves'", async () => {
    const result = await interpretTranscript(
      "I'm putting paper towels in the basement on the shelves to the left",
      async () => {
        throw new Error("openai down");
      },
    );
    expect(result).toEqual({
      intent: "put_away",
      itemText: "paper towels",
      quantity: 1,
      locationPath: ["basement", "shelves to the left"],
    });
  });

  it("still reverses specific-to-general 'on … in …' paths", async () => {
    const result = await interpretTranscript(
      "I'm putting paper towels on the shelf a on the metal shelves in the basement",
      async () => {
        throw new Error("openai down");
      },
    );
    expect(result).toEqual({
      intent: "put_away",
      itemText: "paper towels",
      quantity: 1,
      locationPath: ["basement", "metal shelves", "shelf a"],
    });
  });

  it("parses 'Took out a roll of paper towels' as take_out of paper towels", async () => {
    const result = await interpretTranscript("Took out a roll of paper towels", async () => {
      throw new Error("openai down");
    });
    expect(result).toEqual({
      intent: "take_out",
      itemText: "paper towels",
      quantity: 1,
    });
  });

  it("parses 'I took out two paper towels'", async () => {
    const result = await interpretTranscript("I took out two paper towels", async () => {
      throw new Error("openai down");
    });
    expect(result).toEqual({
      intent: "take_out",
      itemText: "paper towels",
      quantity: 2,
    });
  });

  it("auto-detects a multi-item put-away ramble from extract JSON", async () => {
    const result = await interpretTranscript(
      "On the bottom shelf of my basement shelves, there is dishwasher detergent, paper towels, and two bottles of dawn",
      async () => ({
        intent: "put_away",
        locationPath: ["basement", "shelves", "bottom shelf"],
        items: [
          { itemText: "dishwasher detergent" },
          { itemText: "paper towels" },
          { itemText: "dawn", quantity: 2 },
        ],
      }),
    );
    expect(result).toEqual({
      intent: "put_away_batch",
      locationPath: ["basement", "shelves", "bottom shelf"],
      items: [
        { itemText: "dishwasher detergent", quantity: 1 },
        { itemText: "paper towels", quantity: 1 },
        { itemText: "dawn", quantity: 2 },
      ],
    });
  });

  it("runs fixtures through extract", async () => {
    for (const f of fixtures) {
      const result = await interpretTranscript(f.transcript, async () => f.llm);
      expect(result).toEqual(f.expected);
    }
  });
});
