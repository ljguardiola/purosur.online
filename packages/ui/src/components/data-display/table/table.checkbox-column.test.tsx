import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { tokenRgb } from "../../../test/token-colors";
import { Checkbox } from "../../forms/checkbox";
import { Table } from "./table";
import { TableCellText } from "./table-cell-text";
import { dataColumn } from "./table-columns";
import { useTableModel } from "./use-table-model";

type Line = { id: string; name: string; sold: string; returned: string; refused: boolean };

const lines: readonly Line[] = [
  { id: "1", name: "Almonds", sold: "0,250 kg", returned: "0,250 kg", refused: false },
  { id: "2", name: "Oats", sold: "0,500 kg", returned: "—", refused: false },
  { id: "3", name: "Yerba mate", sold: "2 u", returned: "3 u", refused: true },
];

function LinesTable({
  onToggle = () => {},
  onRowPress,
}: {
  onToggle?: (id: string, checked: boolean) => void;
  onRowPress?: (line: Line) => void;
}) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(["1", "3"]));
  const table = useTableModel({
    items: lines,
    id: (line) => line.id,
    columns: [
      dataColumn({
        id: "mark",
        header: "Mark",
        width: 56,
        render: (line: Line) => (
          <Checkbox
            name={`mark-${line.id}`}
            checked={checked.has(line.id)}
            onCheckedChange={(next) => {
              setChecked((current) => {
                const updated = new Set(current);
                if (next) {
                  updated.add(line.id);
                } else {
                  updated.delete(line.id);
                }
                return updated;
              });
              onToggle(line.id, next);
            }}
          >
            <span className="sr-only">{line.name}</span>
          </Checkbox>
        ),
      }),
      dataColumn({
        id: "name",
        header: "Product",
        render: (line: Line) => <TableCellText strong>{line.name}</TableCellText>,
      }),
      dataColumn({
        id: "returned",
        header: "To return",
        render: (line: Line) => (
          <TableCellText strong tone={line.refused ? "error" : undefined}>
            {line.returned}
          </TableCellText>
        ),
      }),
    ],
  });
  return (
    <Table
      table={table}
      aria-label="Lines"
      rowState={(line) => (line.id === "1" ? "selected" : undefined)}
      {...(onRowPress === undefined ? {} : { onRowPress })}
    />
  );
}

test("renders a checkbox in the first column of each row, named by its product, checked as the caller says", async () => {
  const screen = await render(<LinesTable />);

  const almonds = screen.getByRole("checkbox", { name: "Almonds" }).element() as HTMLInputElement;
  const oats = screen.getByRole("checkbox", { name: "Oats" }).element() as HTMLInputElement;
  expect(almonds.checked).toBe(true);
  expect(oats.checked).toBe(false);
  expect(screen.getByRole("checkbox").elements()).toHaveLength(3);
  expect(almonds.closest("td")?.cellIndex).toBe(0);
});

test("toggles a line's checkbox without pressing its row", async () => {
  const onToggle = vi.fn();
  const onRowPress = vi.fn();
  const screen = await render(<LinesTable onToggle={onToggle} onRowPress={onRowPress} />);

  await userEvent.click(screen.getByRole("checkbox", { name: "Oats" }));

  expect(onToggle).toHaveBeenCalledExactlyOnceWith("2", true);
  expect(onRowPress).not.toHaveBeenCalled();
});

test("keeps a selected row's checkbox checked inside the selected row", async () => {
  const screen = await render(<LinesTable />);

  const row = screen.getByRole("checkbox", { name: "Almonds" }).element().closest("tr");
  expect(getComputedStyle(row as HTMLElement).backgroundColor).toBe(tokenRgb("action-subtle"));
});

test("shows a refused line's quantity in red and an accepted one's in the default ink", async () => {
  const screen = await render(<LinesTable />);

  const refused = screen.getByText("3 u").element();
  const accepted = screen.getByText("0,500 kg").element();
  expect(getComputedStyle(refused).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(refused).fontWeight).toBe("700");
  expect(getComputedStyle(accepted).color).not.toBe(tokenRgb("error-strong"));
});

test("has no accessibility violations with a checkbox column", async () => {
  const screen = await render(<LinesTable />);

  await expectNoAccessibilityViolations(screen.container);
});
