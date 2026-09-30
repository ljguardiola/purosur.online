import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { SignedInScreen } from "./signed-in-screen";

const PERSON = { first_name: "Ada", permission_keys: ["sell_and_charge", "void_sale"] };

describe("SignedInScreen", () => {
  it("asks what to do, with no session open", async () => {
    const screen = await render(<SignedInScreen person={PERSON} registerName={null} />);

    await expect.element(screen.getByText("Sin sesión abierta")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "¿Qué querés hacer?" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows only the first name of the person who is in", async () => {
    const screen = await render(<SignedInScreen person={PERSON} registerName={null} />);

    await expect
      .element(screen.getByRole("complementary", { name: "Persona en la caja" }))
      .toHaveTextContent("Ada");
    expect(screen.container.textContent).not.toContain("sell_and_charge");
  });

  it("offers nothing to do yet", async () => {
    const screen = await render(<SignedInScreen person={PERSON} registerName={null} />);

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  });
});
