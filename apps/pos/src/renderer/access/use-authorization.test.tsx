import { describe, expect, it, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import type { SignedInPerson } from "./signed-in-person";
import { useAuthorization } from "./use-authorization";

const WITHOUT_PERMISSION: SignedInPerson = {
  user_id: "u1",
  first_name: "Tomás",
  permission_keys: ["sell_and_charge"],
};

function Probe({
  applies,
  loadAuthorizers = async () => [],
}: {
  applies?: boolean;
  loadAuthorizers?: () => Promise<[]>;
}) {
  const authorization = useAuthorization({
    person: WITHOUT_PERMISSION,
    permission: "record_cash_in",
    loadAuthorizers,
    ...(applies === undefined ? {} : { applies }),
  });
  return <p>{authorization.required ? "required" : "not required"}</p>;
}

describe("useAuthorization", () => {
  it("requires an authorizer from a person who lacks the permission", async () => {
    const screen = await render(<Probe />);

    await expect.element(screen.getByText("required", { exact: true })).toBeVisible();
  });

  it("requires nothing of a person who lacks the permission when it does not apply", async () => {
    const screen = await render(<Probe applies={false} />);

    await expect.element(screen.getByText("not required")).toBeVisible();
  });

  it("does not load authorizers when it does not apply", async () => {
    const loadAuthorizers = vi.fn(async (): Promise<[]> => []);

    await render(<Probe applies={false} loadAuthorizers={loadAuthorizers} />);

    expect(loadAuthorizers).not.toHaveBeenCalled();
  });
});
