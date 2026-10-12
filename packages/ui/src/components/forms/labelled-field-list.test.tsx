import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { LabelledFieldList } from "./labelled-field-list";
import { TextField } from "./text-field";

function quantityField(label: string) {
  return (
    <TextField
      kind="quantity"
      suffix="kg"
      label={label}
      labelVisuallyHidden
      value=""
      onChange={() => {}}
    />
  );
}

const items = [
  {
    id: "first",
    title: "L-2312",
    detail: "Vence el 14/10/2026 · saldo 4,400 kg",
    field: quantityField("Cantidad del lote L-2312"),
  },
  {
    id: "second",
    title: "L-2401",
    detail: "Sin vencimiento · saldo 8,000 kg",
    field: quantityField("Cantidad del lote L-2401"),
  },
];

test("renders each item's title in bold body text above its detail in subtle detail text", async () => {
  const screen = await render(<LabelledFieldList items={items} />);
  const title = screen.getByText("L-2312", { exact: true }).element() as HTMLElement;
  const detail = screen
    .getByText("Vence el 14/10/2026 · saldo 4,400 kg", { exact: true })
    .element() as HTMLElement;

  expect(getComputedStyle(title).fontSize).toBe("16px");
  expect(getComputedStyle(title).fontWeight).toBe("700");
  expect(getComputedStyle(title).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(detail).fontSize).toBe("14px");
  expect(getComputedStyle(detail).color).toBe(tokenRgb("text-subtle"));
  expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    detail.getBoundingClientRect().top,
  );
});

test("puts each item's field at the right of its title, 160px wide whatever the row's width", async () => {
  const screen = await render(
    <div style={{ width: "480px" }}>
      <LabelledFieldList
        items={[
          { id: "only", title: "L-2312", detail: "Sin vencimiento", field: <div>Campo</div> },
        ]}
      />
    </div>,
  );
  const title = screen.getByText("L-2312", { exact: true }).element() as HTMLElement;
  const field = screen.getByText("Campo", { exact: true }).element() as HTMLElement;

  expect(field.getBoundingClientRect().width).toBe(160);
  expect(field.getBoundingClientRect().right).toBeCloseTo(480, 0);
  expect(title.getBoundingClientRect().right).toBeLessThan(field.getBoundingClientRect().left);
});

test("renders the items in the order given", async () => {
  const screen = await render(<LabelledFieldList items={items} />);
  const first = screen.getByText("L-2312", { exact: true }).element() as HTMLElement;
  const second = screen.getByText("L-2401", { exact: true }).element() as HTMLElement;

  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await expectNoAccessibilityViolations(screen.container);
});

test("frames all the items in one 8px rounded container with the design system's border", async () => {
  const screen = await render(<LabelledFieldList items={items} />);
  const list = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(list);

  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(style.borderTopLeftRadius).toBe("8px");
  expect(list.childElementCount).toBe(2);
});

test("pads each item 12px vertically and 16px horizontally and divides the items with a 1px line", async () => {
  const screen = await render(<LabelledFieldList items={items} />);
  const [first, second] = Array.from(
    (screen.container.firstElementChild as HTMLElement).children,
  ) as HTMLElement[];
  const firstStyle = getComputedStyle(first as HTMLElement);
  const secondStyle = getComputedStyle(second as HTMLElement);

  expect(firstStyle.paddingTop).toBe("12px");
  expect(firstStyle.paddingBottom).toBe("12px");
  expect(firstStyle.paddingLeft).toBe("16px");
  expect(firstStyle.paddingRight).toBe("16px");
  expect(firstStyle.borderTopWidth).toBe("0px");
  expect(secondStyle.borderTopWidth).toBe("1px");
  expect(secondStyle.borderTopColor).toBe(tokenRgb("border"));
});

test("writes a title of the identifier kind in bold monospace", async () => {
  const screen = await render(<LabelledFieldList items={items} titleKind="identifier" />);
  const title = screen.getByText("L-2312", { exact: true }).element() as HTMLElement;
  const style = getComputedStyle(title);

  expect(style.fontFamily).toMatch(/monospace$/);
  expect(style.fontWeight).toBe("700");
});

test("writes a title in the regular font unless it is of the identifier kind", async () => {
  const screen = await render(<LabelledFieldList items={items} />);
  const title = screen.getByText("L-2312", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(title).fontFamily).not.toMatch(/monospace/);
});
