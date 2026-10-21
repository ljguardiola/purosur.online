import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { DocumentList } from "./document-list";
import { Tag } from "./tag";

const ROWS = [
  { title: "Factura C", detail: "Para el cliente", status: <Tag tone="info">Imprimiendo</Tag> },
] as const;

test("lists each document as a row with its title, its detail and its status", async () => {
  const screen = await render(<DocumentList label="Documentos" rows={ROWS} />);

  await expect.element(screen.getByRole("list", { name: "Documentos" })).toBeVisible();
  const row = screen.getByRole("listitem").element();
  expect(row.textContent).toBe("Factura CPara el clienteImprimiendo");
});

test("keeps the status at the right edge of the row, apart from the title", async () => {
  const screen = await render(<DocumentList label="Documentos" rows={ROWS} />);
  const row = screen.getByRole("listitem").element() as HTMLElement;
  const status = screen.getByText("Imprimiendo").element() as HTMLElement;
  const title = screen.getByText("Factura C").element() as HTMLElement;

  expect(title.getBoundingClientRect().left).toBeLessThan(status.getBoundingClientRect().left);
  expect(status.getBoundingClientRect().right).toBeLessThanOrEqual(
    row.getBoundingClientRect().right,
  );
});

test("draws a border around each row", async () => {
  const screen = await render(<DocumentList label="Documentos" rows={ROWS} />);
  const style = getComputedStyle(screen.getByRole("listitem").element());

  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
});

test("shows the detail in secondary text", async () => {
  const screen = await render(<DocumentList label="Documentos" rows={ROWS} />);

  expect(getComputedStyle(screen.getByText("Para el cliente").element()).color).toBe(
    tokenRgb("text-subtle"),
  );
});

test("has no accessibility violations", async () => {
  const screen = await render(<DocumentList label="Documentos" rows={ROWS} />);

  await expectNoAccessibilityViolations(screen.container);
});
