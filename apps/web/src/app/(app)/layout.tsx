import { Suspense, type ReactNode } from "react";
import { AppNav } from "./app-nav";
import { loadHouseholdState } from "./household-state";
import { SignInForm } from "./sign-in-form";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await loadHouseholdState();

  return (
    <div>
      <Suspense fallback={<nav>Inventory · Locations · Household</nav>}>
        <AppNav />
      </Suspense>
      {user ? children : <SignInForm />}
    </div>
  );
}
