import { Search } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { SearchField } from "../forms/search-field";
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

test("draws its Balanza title in the warning color", async () => {
  const screen = await render(<ScaleCard reading={{ value: "0,172 kg", settled: true }} />);

  expect(getComputedStyle(screen.getByText("Balanza").element()).color).toBe(tokenRgb("warning"));
  await expectNoAccessibilityViolations(screen.container);
});

test("says Sin lectura on the warning surface when the scale gives no reading", async () => {
  const screen = await render(<ScaleCard noReading />);

  await expect.element(screen.getByText("Sin lectura")).toBeVisible();
  expect(screen.container.textContent).toBe("BalanzaSin lectura");
  expect(getComputedStyle(screen.container.firstElementChild as HTMLElement).backgroundColor).toBe(
    tokenRgb("warning-subtle"),
  );
  await expectNoAccessibilityViolations(screen.container);
});

test.each([
  ["with no reading", <ScaleCard key="idle" />],
  ["with a reading", <ScaleCard key="reading" reading={{ value: "0,172 kg", settled: true }} />],
  ["saying Sin lectura", <ScaleCard key="no-reading" noReading />],
])("stands as tall as the register's search field beside it %s", async (_, card) => {
  const screen = await render(
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <SearchField
          label="Producto"
          icon={<Search />}
          placeholder="Escaneá"
          value=""
          onChange={() => {}}
        />
      </div>
      {card}
    </div>,
  );

  const row = screen.container.firstElementChild as HTMLElement;
  const fieldBox = row.querySelector("input")?.closest("div.rounded-lg") as HTMLElement;
  const cardBox = row.lastElementChild as HTMLElement;
  expect(cardBox.getBoundingClientRect().height).toBe(fieldBox.getBoundingClientRect().height);
});
