import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { LineItemList } from "./line-item-list";

const ITEMS = [
  { id: "1", name: "Almendras peladas", quantity: "0,325 kg", amount: "$ 6.142,50" },
  { id: "2", name: "Yerba mate orgánica 1 kg", quantity: "2 u", amount: "$ 13.900,00" },
] as const;

test("lists each line as an item of a list named by its label", async () => {
  const screen = await render(<LineItemList label="Productos" items={ITEMS} />);

  await expect.element(screen.getByRole("list", { name: "Productos" })).toBeVisible();
  const rows = screen.getByRole("listitem").elements();
  expect(rows.map((row) => row.textContent)).toEqual([
    "Almendras peladas0,325 kg$ 6.142,50",
    "Yerba mate orgánica 1 kg2 u$ 13.900,00",
  ]);
  await expectNoAccessibilityViolations(screen.container);
});

test("puts the name at the left, the quantity after it and the amount at the right edge", async () => {
  const screen = await render(<LineItemList label="Productos" items={ITEMS} />);
  const row = screen.getByRole("listitem").first().element().getBoundingClientRect();
  const name = screen.getByText("Almendras peladas").element().getBoundingClientRect();
  const quantity = screen.getByText("0,325 kg").element().getBoundingClientRect();
  const amount = screen.getByText("$ 6.142,50").element().getBoundingClientRect();

  expect(name.left).toBeCloseTo(row.left, 0);
  expect(name.right).toBeLessThanOrEqual(quantity.left);
  expect(quantity.right).toBeLessThanOrEqual(amount.left);
  expect(amount.right).toBeCloseTo(row.right, 0);
});

test("aligns the quantities and the amounts of every row to the same right edges", async () => {
  const screen = await render(<LineItemList label="Productos" items={ITEMS} />);
  const quantities = ["0,325 kg", "2 u"].map(
    (text) => screen.getByText(text).element().getBoundingClientRect().right,
  );
  const amounts = ["$ 6.142,50", "$ 13.900,00"].map(
    (text) => screen.getByText(text).element().getBoundingClientRect().right,
  );

  expect(quantities[0]).toBeCloseTo(quantities[1] as number, 0);
  expect(amounts[0]).toBeCloseTo(amounts[1] as number, 0);
});

test("shows the name regular, the quantity subtle in monospace and the amount bold", async () => {
  const screen = await render(<LineItemList label="Productos" items={ITEMS} />);
  const name = getComputedStyle(screen.getByText("Almendras peladas").element());
  const quantity = getComputedStyle(screen.getByText("0,325 kg").element());
  const amount = getComputedStyle(screen.getByText("$ 6.142,50").element());
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();

  expect(name.fontWeight).toBe("400");
  expect(name.color).toBe(tokenRgb("text"));
  expect(quantity.color).toBe(tokenRgb("text-subtle"));
  expect(quantity.fontFamily).toBe(mono);
  expect(amount.fontWeight).toBe("700");
});

test("wraps a long name without pushing the amount out of the row", async () => {
  const screen = await render(
    <div style={{ width: "280px" }}>
      <LineItemList
        label="Productos"
        items={[
          {
            id: "1",
            name: "Harina integral de trigo orgánica molida a piedra",
            quantity: "1,000 kg",
            amount: "$ 3.200,00",
          },
        ]}
      />
    </div>,
  );
  const row = screen.getByRole("listitem").element().getBoundingClientRect();
  const amount = screen.getByText("$ 3.200,00").element().getBoundingClientRect();

  expect(amount.right).toBeLessThanOrEqual(row.right);
});
