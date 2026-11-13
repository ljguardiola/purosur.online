import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { KeyLegend, type KeyLegendProps } from "./key-legend";

const items = [
  { keyName: "ArrowUpDown", label: "Líneas" },
  { keyName: "F2", label: "Buscar" },
  { keyName: "Delete", label: "Quitar" },
] as const;

test("shows each key's cap beside its label, in the order given", async () => {
  const screen = await render(
    <main>
      <KeyLegend items={items} />
    </main>,
  );

  const entries = screen.getByRole("listitem").elements();
  expect(entries.map((entry) => entry.textContent)).toEqual(["↑↓Líneas", "F2Buscar", "SuprQuitar"]);
  expect(entries.map((entry) => entry.querySelector("kbd")?.textContent)).toEqual([
    "↑↓",
    "F2",
    "Supr",
  ]);
  await expectNoAccessibilityViolations(document.body);
});

test("lays the entries out in one row with the label in secondary text", async () => {
  const screen = await render(<KeyLegend items={items} />);

  const [first, second] = screen.getByRole("listitem").elements() as HTMLElement[];
  expect(first?.getBoundingClientRect().top).toBe(second?.getBoundingClientRect().top);
  expect(first?.getBoundingClientRect().right).toBeLessThan(
    second?.getBoundingClientRect().left ?? 0,
  );
  const label = getComputedStyle(first as HTMLElement);
  expect(label.color).toBe(tokenRgb("text-subtle"));
  expect(label.fontSize).toBe("14px");
  expect(label.columnGap).toBe("8px");
});

test("renders nothing for an empty list", async () => {
  const screen = await render(<KeyLegend items={[]} />);

  expect(screen.container.innerHTML).toBe("");
});

test("needs its items, whose labels come from the app", () => {
  expectTypeOf<{ items: [] }>().toExtend<KeyLegendProps>();
  expectTypeOf<{ items: [{ keyName: "F2"; label: string }] }>().toExtend<KeyLegendProps>();
  expectTypeOf<{ items: [{ keyName: "F2" }] }>().not.toExtend<KeyLegendProps>();
  expectTypeOf<{ items: [{ keyName: "F1"; label: string }] }>().toExtend<KeyLegendProps>();
  expectTypeOf<{ items: [{ keyName: "F0"; label: string }] }>().not.toExtend<KeyLegendProps>();
  expectTypeOf<object>().not.toExtend<KeyLegendProps>();
});

test("shows the keypad plus and minus keys as one pair with a single label", async () => {
  const screen = await render(
    <KeyLegend items={[{ keyName: "NumpadAddSubtract", label: "Cantidad" }]} />,
  );

  expect(screen.getByRole("listitem").element().textContent).toBe("+/−Cantidad");
  expect(screen.container.querySelectorAll("kbd")).toHaveLength(1);
});

test("shows the Tab key beside a field label and the arrows beside an option label", async () => {
  const screen = await render(
    <KeyLegend
      items={[
        { keyName: "Tab", label: "Campo" },
        { keyName: "ArrowLeftRight", label: "Opción" },
      ]}
    />,
  );

  const entries = screen.getByRole("listitem").elements();
  expect(entries.map((entry) => entry.textContent)).toEqual(["TabCampo", "←→Opción"]);
});
