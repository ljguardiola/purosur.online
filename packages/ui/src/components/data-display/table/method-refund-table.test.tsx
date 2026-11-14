import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { tokenRgb } from "../../../test/token-colors";
import { MethodRefundTable, type MethodRefundTableProps } from "./method-refund-table";

const rows: MethodRefundTableProps["rows"] = [
  { id: "cash", method: "Cash", when: "On the spot", amount: "3.510,00" },
  { id: "debit", method: "Debit card", when: "Pending refund", amount: "5.000,00" },
];

function table(props: Partial<MethodRefundTableProps> = {}) {
  return (
    <div style={{ height: 400, width: 800 }}>
      <MethodRefundTable
        aria-label="Refund by method"
        headers={{ method: "Method", when: "When", amount: "Refund" }}
        amountPrefix="$"
        rows={rows}
        selectedIndex={0}
        onSelect={() => {}}
        onAmountChange={() => {}}
        {...props}
      />
    </div>
  );
}

function ControlledTable({
  onSelect,
  onAmountChange,
}: {
  onSelect: (index: number) => void;
  onAmountChange: (id: string, amount: string) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [amounts, setAmounts] = useState<Record<string, string>>({ cash: "", debit: "" });
  return table({
    rows: rows.map((row) => ({ ...row, amount: amounts[row.id] ?? "" })),
    selectedIndex,
    onSelect: (index) => {
      setSelectedIndex(index);
      onSelect(index);
    },
    onAmountChange: (id, amount) => {
      setAmounts((current) => ({ ...current, [id]: amount }));
      onAmountChange(id, amount);
    },
  });
}

test("shows the three column headers the caller gives", async () => {
  const screen = await render(table());

  await expect.element(screen.getByRole("columnheader", { name: "Method" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "When" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Refund" })).toBeVisible();
});

test("shows each method in bold, when it is refunded, and its amount in an input", async () => {
  const screen = await render(table());

  const method = screen.getByText("Cash").element();
  expect(getComputedStyle(method).fontWeight).toBe("700");
  await expect.element(screen.getByText("On the spot")).toBeVisible();
  await expect.element(screen.getByText("Pending refund")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Cash" })).toHaveValue("3.510,00");
  await expect.element(screen.getByRole("textbox", { name: "Debit card" })).toHaveValue("5.000,00");
});

test("shows the caller's prefix before each amount and right-aligns it", async () => {
  const screen = await render(table());

  const input = screen.getByRole("textbox", { name: "Cash" }).element();
  const prefix = screen.getByText("$").first().element();
  expect(prefix.getBoundingClientRect().right).toBeLessThanOrEqual(
    input.getBoundingClientRect().left + 1,
  );
  expect(getComputedStyle(input).textAlign).toBe("right");
  expect(screen.getByText("$").elements()).toHaveLength(2);
});

test("highlights the selected row with the table's selected state and no other", async () => {
  const screen = await render(table({ selectedIndex: 1 }));

  const selected = screen.getByRole("row", { name: /Debit card/ }).element();
  const other = screen.getByRole("row", { name: /Cash/ }).element();
  expect(selected.getAttribute("aria-current")).toBe("true");
  expect(getComputedStyle(selected).backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(other.getAttribute("aria-current")).toBeNull();
});

test("focuses the selected row's input and moves focus when the selection changes", async () => {
  const screen = await render(<ControlledTable onSelect={() => {}} onAmountChange={() => {}} />);

  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("textbox", { name: "Cash" }).element());

  await userEvent.click(screen.getByText("Pending refund"));

  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole("textbox", { name: "Debit card" }).element());
});

test("reports the chosen row when a row is pressed or its input is focused", async () => {
  const onSelect = vi.fn();
  const screen = await render(<ControlledTable onSelect={onSelect} onAmountChange={() => {}} />);

  await userEvent.click(screen.getByText("Pending refund"));
  expect(onSelect).toHaveBeenLastCalledWith(1);

  await userEvent.click(screen.getByRole("textbox", { name: "Cash" }));
  expect(onSelect).toHaveBeenLastCalledWith(0);
});

test("reports what is typed in a row's input with the row's id, keeping two decimals", async () => {
  const onAmountChange = vi.fn();
  const screen = await render(
    <ControlledTable onSelect={() => {}} onAmountChange={onAmountChange} />,
  );

  await userEvent.type(screen.getByRole("textbox", { name: "Debit card" }), "5000,555");

  expect(onAmountChange).toHaveBeenLastCalledWith("debit", "5.000,55");
  await expect.element(screen.getByRole("textbox", { name: "Cash" })).toHaveValue("");
});

test("marks invalid the amount of the row the caller says is invalid, and no other", async () => {
  const screen = await render(
    table({ rows: rows.map((row) => (row.id === "cash" ? { ...row, invalid: true } : row)) }),
  );

  await expect
    .element(screen.getByRole("textbox", { name: "Cash" }))
    .toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("textbox", { name: "Debit card" }))
    .not.toHaveAttribute("aria-invalid");
});

test("lists the keys of its legend below the rows", async () => {
  const screen = await render(table({ legend: [{ keyName: "ArrowUpDown", label: "Medio" }] }));

  await expect.poll(() => screen.getByRole("listitem").element().textContent).toContain("Medio");
});

test("has no accessibility violations", async () => {
  const screen = await render(table());

  await expectNoAccessibilityViolations(screen.container);
});

test("requires its headers, prefix, rows, selection and handlers", () => {
  expectTypeOf<Omit<MethodRefundTableProps, "headers">>().not.toExtend<MethodRefundTableProps>();
  expectTypeOf<
    Omit<MethodRefundTableProps, "amountPrefix">
  >().not.toExtend<MethodRefundTableProps>();
  expectTypeOf<Omit<MethodRefundTableProps, "rows">>().not.toExtend<MethodRefundTableProps>();
  expectTypeOf<
    Omit<MethodRefundTableProps, "selectedIndex">
  >().not.toExtend<MethodRefundTableProps>();
  expectTypeOf<Omit<MethodRefundTableProps, "onSelect">>().not.toExtend<MethodRefundTableProps>();
  expectTypeOf<
    Omit<MethodRefundTableProps, "onAmountChange">
  >().not.toExtend<MethodRefundTableProps>();
});
