import type { SignInUser } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SignedInPerson } from "./signed-in-person";
import { render } from "./test-support/render-with-router";
import { useAuthorization } from "./use-authorization";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Tomás",
  abilities: ["open_cash_session"],
};

const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];

function Probe({
  required,
  loadAuthorizers = async () => [],
}: {
  required: boolean;
  loadAuthorizers?: () => Promise<SignInUser[]>;
}) {
  const authorization = useAuthorization({
    person: PERSON,
    permission: "record_cash_in",
    loadAuthorizers,
    required,
  });
  return (
    <>
      <p>{authorization.required ? "required" : "not required"}</p>
      <p>{authorization.asking ? "asking" : "not asking"}</p>
      <p>{`chosen: ${authorization.chosen ?? "nobody"}`}</p>
      <p>{`pin: ${authorization.pin}`}</p>
      <button type="button" onClick={() => authorization.type("1234")}>
        Type
      </button>
      <button type="button" onClick={authorization.dismiss}>
        Dismiss
      </button>
      <button type="button" onClick={authorization.ask}>
        Ask
      </button>
      <button type="button" onClick={authorization.cancel}>
        Cancel
      </button>
      <button type="button" onClick={authorization.performed}>
        Performed
      </button>
    </>
  );
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

  it("is not asking until asked, and stops asking when cancelled", async () => {
    const screen = await render(<Probe required />);
    await expect.element(screen.getByText("not asking")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await expect.element(screen.getByText("asking", { exact: true })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await expect.element(screen.getByText("not asking")).toBeVisible();
  });

  it("stops asking once the action was performed", async () => {
    const screen = await render(<Probe required />);
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    await userEvent.click(screen.getByRole("button", { name: "Performed" }));

    await expect.element(screen.getByText("not asking")).toBeVisible();
  });

  it("chooses the first authorizer by first name once they are loaded", async () => {
    const screen = await render(<Probe required loadAuthorizers={async () => AUTHORIZERS} />);

    await expect.element(screen.getByText("chosen: u2")).toBeVisible();
  });

  it("chooses nobody when no authorization is required", async () => {
    const screen = await render(
      <Probe required={false} loadAuthorizers={async () => AUTHORIZERS} />,
    );

    await expect.element(screen.getByText("chosen: nobody")).toBeVisible();
  });

  it("forgets the typed PIN when cancelled", async () => {
    const screen = await render(<Probe required loadAuthorizers={async () => AUTHORIZERS} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await userEvent.click(screen.getByRole("button", { name: "Type" }));
    await expect.element(screen.getByText("pin: 1234")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await expect.element(screen.getByText("pin:", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("not asking")).toBeVisible();
  });

  it("keeps the typed PIN when dismissed, so the authorization given still counts", async () => {
    const screen = await render(<Probe required loadAuthorizers={async () => AUTHORIZERS} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await userEvent.click(screen.getByRole("button", { name: "Type" }));

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await expect.element(screen.getByText("not asking")).toBeVisible();
    await expect.element(screen.getByText("pin: 1234")).toBeVisible();
  });
});
