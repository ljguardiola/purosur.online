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

test("puts each item's field at the right of its title, 170px wide whatever the row's width", async () => {
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

  expect(field.getBoundingClientRect().width).toBe(170);
  expect(field.getBoundingClientRect().right).toBeCloseTo(480 - 1 - 16, 0);
  expect(title.getBoundingClientRect().right).toBeLessThan(field.getBoundingClientRect().left);
});

test("renders the items in the order given, in one bordered card with a divider between them", async () => {
  const screen = await render(<LabelledFieldList items={items} />);
  const first = screen.getByText("L-2312", { exact: true }).element() as HTMLElement;
  const second = screen.getByText("L-2401", { exact: true }).element() as HTMLElement;
  const list = screen.container.firstElementChild as HTMLElement;
  const [firstRow, secondRow] = Array.from(list.children) as [HTMLElement, HTMLElement];

  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(list.children).toHaveLength(2);
  expect(getComputedStyle(list).borderTopWidth).toBe("1px");
  expect(getComputedStyle(list).borderLeftWidth).toBe("1px");
  expect(getComputedStyle(list).borderTopColor).toBe(tokenRgb("border"));
  expect(getComputedStyle(list).borderRadius).toBe("8px");
  expect(getComputedStyle(firstRow).borderBottomWidth).toBe("1px");
  expect(getComputedStyle(firstRow).borderBottomColor).toBe(tokenRgb("border"));
  expect(getComputedStyle(secondRow).borderBottomWidth).toBe("0px");

  await expectNoAccessibilityViolations(screen.container);
});

test("pads each row 12px by 16px with its title, detail and field centered together", async () => {
  const screen = await render(<LabelledFieldList items={items} />);
  const row = (screen.container.firstElementChild as HTMLElement).children[0] as HTMLElement;
  const style = getComputedStyle(row);

  expect(style.paddingTop).toBe("12px");
  expect(style.paddingBottom).toBe("12px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(style.columnGap).toBe("12px");
  expect(style.alignItems).toBe("center");
});

test("writes the titles in a monospace font only when asked to", async () => {
  const screen = await render(
    <>
      <LabelledFieldList items={items} />
      <LabelledFieldList
        monospaceTitles
        items={[
          { id: "mono", title: "M-0001", detail: "Sin vencimiento", field: <div>Campo</div> },
        ]}
      />
    </>,
  );
  const plain = screen.getByText("L-2312", { exact: true }).element() as HTMLElement;
  const mono = screen.getByText("M-0001", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(plain).fontFamily).not.toMatch(/monospace/);
  expect(getComputedStyle(mono).fontFamily).toMatch(/monospace$/);
  expect(getComputedStyle(mono).fontWeight).toBe("700");
});
