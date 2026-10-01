import { describe, expect, it, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import type { SignedInPerson } from "./signed-in-person";
import { useAuthorization } from "./use-authorization";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Tomás",
  abilities: ["open_cash_session"],
};

function Probe({
  required,
  loadAuthorizers = async () => [],
}: {
  required: boolean;
  loadAuthorizers?: () => Promise<[]>;
}) {
  const authorization = useAuthorization({
    person: PERSON,
    permission: "record_cash_in",
    loadAuthorizers,
    required,
  });
  return <p>{authorization.required ? "required" : "not required"}</p>;
}

describe("useAuthorization", () => {
  it("requires an authorizer when the caller says one is required", async () => {
    const loadAuthorizers = vi.fn(async (): Promise<[]> => []);
    const screen = await render(<Probe required loadAuthorizers={loadAuthorizers} />);

    await expect.element(screen.getByText("required", { exact: true })).toBeVisible();
    expect(loadAuthorizers).toHaveBeenCalledOnce();
  });

  it("requires nothing when the caller says none is required", async () => {
    const screen = await render(<Probe required={false} />);

    await expect.element(screen.getByText("not required")).toBeVisible();
  });

  it("does not load authorizers when none is required", async () => {
    const loadAuthorizers = vi.fn(async (): Promise<[]> => []);

    await render(<Probe required={false} loadAuthorizers={loadAuthorizers} />);

    expect(loadAuthorizers).not.toHaveBeenCalled();
  });
});
