import { and, eq } from "drizzle-orm";
import type { CommandOutcome } from "@putaway/shared";
import type { Database } from "../db/client";
import { commandReceipts } from "../db/schema";

export async function withCommandReceipt(
  db: Database,
  {
    householdId,
    userId,
    clientCommandId,
    run,
  }: {
    householdId: string;
    userId: string;
    clientCommandId: string;
    run: () => Promise<CommandOutcome>;
  },
): Promise<CommandOutcome> {
  const [existing] = await db
    .select({ resultJson: commandReceipts.resultJson })
    .from(commandReceipts)
    .where(
      and(
        eq(commandReceipts.householdId, householdId),
        eq(commandReceipts.userId, userId),
        eq(commandReceipts.clientCommandId, clientCommandId),
      ),
    )
    .limit(1);
  if (existing) {
    return JSON.parse(existing.resultJson) as CommandOutcome;
  }

  const outcome = await run();
  await db.insert(commandReceipts).values({
    householdId,
    userId,
    clientCommandId,
    resultJson: JSON.stringify(outcome),
  });
  return outcome;
}
