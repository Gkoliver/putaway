import { eq } from "drizzle-orm";
import { getDb } from "../../../lib/db/client";
import { householdMembers, user } from "../../../lib/db/schema";
import { loadHouseholdState } from "../household-state";
import { createHouseholdAction, createInviteAction } from "./actions";

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<{ householdId?: string }>;
}) {
  const { householdId } = await searchParams;
  const { user: sessionUser, household, households } = await loadHouseholdState(householdId);
  if (!sessionUser) return null;

  if (!household) {
    return (
      <main>
        <h1>Household</h1>
        <form action={createHouseholdAction}>
          <label htmlFor="household-name">Name</label>
          <input id="household-name" name="name" required />
          <button type="submit">Create household</button>
        </form>
      </main>
    );
  }

  const members = await getDb()
    .select({
      userId: householdMembers.userId,
      role: householdMembers.role,
      email: user.email,
      name: user.name,
    })
    .from(householdMembers)
    .leftJoin(user, eq(user.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, household.id));

  return (
    <main>
      <h1>{household.name}</h1>
      {households.length > 1 ? (
        <p>
          {households.map((row) => (
            <a key={row.id} href={`/household?householdId=${row.id}`}>
              {row.name}
            </a>
          ))}
        </p>
      ) : null}
      {household.role === "owner" ? (
        <form action={createInviteAction}>
          <input type="hidden" name="householdId" value={household.id} />
          <label htmlFor="invite-email">Email</label>
          <input id="invite-email" name="email" type="email" required />
          <label htmlFor="invite-role">Role</label>
          <select id="invite-role" name="role" defaultValue="member">
            <option value="member">member</option>
            <option value="owner">owner</option>
          </select>
          <button type="submit">Invite</button>
        </form>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.userId}>
              <td>{member.email ?? member.name ?? member.userId}</td>
              <td>{member.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
