import type { SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import type { CoreData } from "../platform/use-core-query";
import { useAuthorizersQuery, useRefreshAuthorizers, useSignInUsersQuery } from "./access-queries";

const ADA: SignInUser = { id: "u1", first_name: "Ada" };
const GRACE: SignInUser = { id: "u2", first_name: "Grace" };

function names(data: CoreData<SignInUser[]>): string {
  return data.status === "loaded"
    ? data.value.map((user) => user.first_name).join(",")
    : data.status;
}

function renderWithClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

function UsersProbe({ read }: { read: () => Promise<SignInUser[]> }) {
  return <p>{names(useSignInUsersQuery(read))}</p>;
}

type AuthorizersProbeProps = {
  permission: AuthorizablePermissionKey;
  read: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  enabled?: boolean;
};

function AuthorizersProbe({ permission, read, enabled = true }: AuthorizersProbeProps) {
  const data = useAuthorizersQuery({ permission, read: () => read(permission), enabled });
  const refresh = useRefreshAuthorizers(permission);
  return (
    <>
      <p>{names(data)}</p>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </>
  );
}

describe("access queries", () => {
  it("hold the people who can sign in", async () => {
    const screen = await renderWithClient(<UsersProbe read={async () => [ADA, GRACE]} />);

    await expect.element(screen.getByText("Ada,Grace")).toBeVisible();
  });

  it("fail when the people who can sign in cannot be read", async () => {
    const screen = await renderWithClient(
      <UsersProbe read={() => Promise.reject(new Error("the connection was replaced"))} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("hold the people who can authorize a permission", async () => {
    const screen = await renderWithClient(
      <AuthorizersProbe permission="close_anothers_register_session" read={async () => [GRACE]} />,
    );

    await expect.element(screen.getByText("Grace")).toBeVisible();
  });

  it("read the authorizers of each permission on its own", async () => {
    const read = vi.fn(async (permission: AuthorizablePermissionKey) =>
      permission === "close_anothers_register_session" ? [GRACE] : [ADA],
    );
    const screen = await renderWithClient(
      <>
        <AuthorizersProbe permission="close_anothers_register_session" read={read} />
        <AuthorizersProbe permission="withdraw_cash" read={read} />
      </>,
    );

    await expect.element(screen.getByText("Grace")).toBeVisible();
    await expect.element(screen.getByText("Ada")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("do not read the authorizers while disabled", async () => {
    const read = vi.fn(async () => [ADA]);
    const screen = await renderWithClient(
      <AuthorizersProbe permission="withdraw_cash" read={read} enabled={false} />,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(read).not.toHaveBeenCalled();
  });

  it("read the authorizers of a permission again when they are refreshed", async () => {
    const read = vi
      .fn<AuthorizersProbeProps["read"]>()
      .mockResolvedValueOnce([ADA])
      .mockResolvedValueOnce([GRACE]);
    const screen = await renderWithClient(
      <AuthorizersProbe permission="withdraw_cash" read={read} />,
    );
    await expect.element(screen.getByText("Ada")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.element(screen.getByText("Grace")).toBeVisible();
  });
});
