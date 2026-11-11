import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { expect } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignInUsers } from "../../platform/core-client";
import { render } from "../../shell/test-support/render-with-router";
import { SignInScreen } from "../sign-in-screen";

export const USERS: SignInUser[] = [
  { id: "u2", first_name: "Bruno" },
  { id: "u1", first_name: "Ada" },
  { id: "u3", first_name: "Carla" },
];

export const SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", abilities: [] },
  cash_session: null,
};

export function roster(
  users: SignInUser[] = USERS,
  lastActiveUserId: string | null = null,
): SignInUsers {
  return { users, last_active_user_id: lastActiveUserId };
}

export type Screen = Awaited<ReturnType<typeof render>>;

export async function renderSignIn({
  loadUsers = async () => roster(),
  signIn = async () => SIGNED_IN,
  version = null,
}: {
  loadUsers?: () => Promise<SignInUsers>;
  signIn?: (userId: string, pin: string) => Promise<SignInOutcome>;
  version?: string | null;
} = {}) {
  return render(<SignInScreen loadUsers={loadUsers} signIn={signIn} version={version} />);
}

export function userSelect(screen: Screen) {
  return screen.getByRole("button", { name: /USUARIO/ });
}

export async function choose(screen: Screen, firstName: string) {
  await userEvent.click(userSelect(screen));
  await userEvent.click(page.getByRole("option", { name: firstName }));
}

export async function expectChosen(screen: Screen, firstName: string) {
  await expect.element(userSelect(screen).getByText(firstName, { exact: true })).toBeVisible();
}
