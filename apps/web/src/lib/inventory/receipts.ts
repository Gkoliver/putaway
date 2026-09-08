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
    run: (tx: Database) => Promise<CommandOutcome>;
  },
): Promise<CommandOutcome> {
  return db.transaction(async (tx) => {
    const dbTx = tx as unknown as Database;
    const [claimed] = await tx
      .insert(commandReceipts)
      .values({
        householdId,
        userId,
        clientCommandId,
        resultJson: "",
      })
      .onConflictDoNothing()
      .returning({ id: commandReceipts.id });

    if (!claimed) {
      const [existing] = await tx
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
      if (!existing) {
        throw new Error("command receipt missing after conflict");
      }
      return JSON.parse(existing.resultJson) as CommandOutcome;
    }

    const outcome = await run(dbTx);
    await tx
      .update(commandReceipts)
      .set({ resultJson: JSON.stringify(outcome) })
      .where(eq(commandReceipts.id, claimed.id));
    return outcome;
  });
}
