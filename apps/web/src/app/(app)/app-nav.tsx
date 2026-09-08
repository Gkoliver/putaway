"use client";

import { useSearchParams } from "next/navigation";

function href(path: string, householdId: string | null): string {
  if (!householdId) return path;
  return `${path}?householdId=${encodeURIComponent(householdId)}`;
}

export function AppNav() {
  const householdId = useSearchParams().get("householdId");
  return (
    <nav>
      <a href={href("/inventory", householdId)}>Inventory</a>
      {" · "}
      <a href={href("/locations", householdId)}>Locations</a>
      {" · "}
      <a href={href("/household", householdId)}>Household</a>
    </nav>
  );
}
