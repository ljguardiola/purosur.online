import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { NavigationRail } from "./navigation-rail";

describe("NavigationRail", () => {
  it("shows the first name of the person in the register, named as who is in it", async () => {
    const screen = await render(<NavigationRail firstName="Ada" />);

    const status = screen.getByRole("complementary", { name: "Persona en la caja" });

    await expect.element(status).toHaveTextContent("Ada");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("is 88px wide", async () => {
    const screen = await render(<NavigationRail firstName="Ada" />);

    const rail = screen.getByRole("complementary", { name: "Persona en la caja" }).element();

    expect(rail.getBoundingClientRect().width).toBe(88);
  });

  it("keeps a long name inside the rail", async () => {
    const screen = await render(
      <NavigationRail firstName="Maximiliano-Bartolomé-de-la-Santísima-Trinidad" />,
    );

    const rail = screen.getByRole("complementary", { name: "Persona en la caja" }).element();

    expect(rail.getBoundingClientRect().width).toBe(88);
    expect(rail.scrollWidth).toBeLessThanOrEqual(88);
  });
});
