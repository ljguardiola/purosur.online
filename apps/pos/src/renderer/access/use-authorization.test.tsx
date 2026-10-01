import { describe, expect, it, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import type { SignedInPerson } from "./signed-in-person";
import { useAuthorization } from "./use-authorization";

const WITHOUT_PERMISSION: SignedInPerson = {
  user_id: "u1",
  first_name: "Tomás",
  permission_keys: ["sell_and_charge"],
};
const WITH_PERMISSION: SignedInPerson = {
  ...WITHOUT_PERMISSION,
  permission_keys: ["sell_and_charge", "record_cash_in"],
};

function Probe({
  person = WITHOUT_PERMISSION,
  decision = {},
  loadAuthorizers = async () => [],
}: {
  person?: SignedInPerson;
  decision?: { required: boolean } | Record<string, never>;
  loadAuthorizers?: () => Promise<[]>;
}) {
  const authorization = useAuthorization({
    person,
    permission: "record_cash_in",
    loadAuthorizers,
    ...decision,
  });
  return <p>{authorization.required ? "required" : "not required"}</p>;
}

describe("useAuthorization", () => {
  it("requires an authorizer from a person who lacks the permission", async () => {
    const screen = await render(<Probe />);

    await expect.element(screen.getByText("required", { exact: true })).toBeVisible();
  });

  it("requires an authorizer from a person who holds the permission when the caller says one is required", async () => {
    const loadAuthorizers = vi.fn(async (): Promise<[]> => []);
    const screen = await render(
      <Probe
        person={WITH_PERMISSION}
        decision={{ required: true }}
        loadAuthorizers={loadAuthorizers}
      />,
    );

    await expect.element(screen.getByText("required", { exact: true })).toBeVisible();
    expect(loadAuthorizers).toHaveBeenCalledOnce();
  });

  it("requires nothing of a person who lacks the permission when the caller says none is required", async () => {
    const screen = await render(<Probe decision={{ required: false }} />);

    await expect.element(screen.getByText("not required")).toBeVisible();
  });

  it("does not load authorizers when none is required", async () => {
    const loadAuthorizers = vi.fn(async (): Promise<[]> => []);

    await render(<Probe decision={{ required: false }} loadAuthorizers={loadAuthorizers} />);

    expect(loadAuthorizers).not.toHaveBeenCalled();
  });
});
