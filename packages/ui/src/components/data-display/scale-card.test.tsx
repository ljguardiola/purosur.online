import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { ScaleCard } from "./scale-card";

test("shows its Balanza title and no reading when it has none", async () => {
  const screen = await render(<ScaleCard />);

  await expect.element(screen.getByText("Balanza")).toBeVisible();
  expect(screen.container.textContent).toBe("Balanza");
  await expectNoAccessibilityViolations(screen.container);
});

test("is not a control and takes no focus", async () => {
  const screen = await render(<ScaleCard reading={{ value: "0,172 kg", settled: true }} />);

  expect(screen.container.querySelector("button, a, [tabindex]")).toBeNull();
});

test("shows the reading under the title in the regular text color once it settled", async () => {
  const screen = await render(<ScaleCard reading={{ value: "0,172 kg", settled: true }} />);

  await expect.element(screen.getByText("0,172 kg")).toBeVisible();
  expect(getComputedStyle(screen.getByText("0,172 kg").element()).color).toBe(tokenRgb("text"));
});

test("dims the reading like a disabled control while it has not settled", async () => {
  const screen = await render(<ScaleCard reading={{ value: "0,238 kg", settled: false }} />);

  const style = getComputedStyle(screen.getByText("0,238 kg").element());
  expect(style.color).toBe(tokenRgb("text"));
  expect(style.opacity).toBe("0.65");
  await expectNoAccessibilityViolations(screen.container);
});

test("draws a card with a reading on the warning surface and one without on the plain surface", async () => {
  const withReading = await render(<ScaleCard reading={{ value: "0,172 kg", settled: true }} />);
  const without = await render(<ScaleCard />);

  expect(
    getComputedStyle(withReading.container.firstElementChild as HTMLElement).backgroundColor,
  ).toBe(tokenRgb("warning-subtle"));
  expect(getComputedStyle(without.container.firstElementChild as HTMLElement).backgroundColor).toBe(
    tokenRgb("surface"),
  );
});
