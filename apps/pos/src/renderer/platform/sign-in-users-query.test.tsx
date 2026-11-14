import type { SignInUser } from "@purosur/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { SignInUsers } from "./core-client";
import { createQueryClient } from "./query-client";
import { useSignInUsersQuery } from "./sign-in-users-query";

const ADA: SignInUser = { id: "u1", first_name: "Ada" };
const GRACE: SignInUser = { id: "u2", first_name: "Grace" };

function renderWithClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

function UsersProbe({ read }: { read: () => Promise<SignInUsers> }) {
  const data = useSignInUsersQuery(read);
  return (
    <p>
      {data.status === "loaded"
        ? `${data.value.users.map((user) => user.first_name).join(",")} last:${data.value.last_active_user_id}`
        : data.status}
    </p>
  );
}

describe("sign-in users query", () => {
  it("holds the people who can sign in", async () => {
    const screen = await renderWithClient(
      <UsersProbe read={async () => ({ users: [ADA, GRACE], last_active_user_id: "u2" })} />,
    );

    await expect.element(screen.getByText("Ada,Grace last:u2")).toBeVisible();
  });

  it("fails when the people who can sign in cannot be read", async () => {
    const screen = await renderWithClient(
      <UsersProbe read={() => Promise.reject(new Error("the connection was replaced"))} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });
});
