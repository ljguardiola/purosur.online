import { Search } from "lucide-react";
import { useState } from "react";
import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ComboBox } from "../forms/combo-box";
import { SearchField } from "../forms/search-field";
import { ConfirmationInsidePanel, SuppliersArea } from "./test-support/detail-panel";

const WIDE_AREA = 1200;
const NARROW_AREA = 799;

const modes = [
  { mode: "beside the list", areaWidth: WIDE_AREA },
  { mode: "as a modal", areaWidth: NARROW_AREA },
];

beforeEach(async () => {
  await page.viewport(1280, 800);
});

test("moves focus to its title on open and back to the pressed row on close", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);
  const row = screen.getByRole("button", { name: "Almacén Sur" });

  await row.click();

  await expect.element(screen.getByRole("heading", { name: "Almacén Sur" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("complementary").elements()).toHaveLength(0);
  await expect.element(row).toHaveFocus();
});

test("gives focus back to the row pressed last when it closes", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);
  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();
  const lastRow = screen.getByRole("button", { name: "Almacén Sur" });
  await lastRow.click();

  await screen.getByRole("button", { name: "Cerrar" }).click();

  expect(screen.getByRole("complementary").elements()).toHaveLength(0);
  await expect.element(lastRow).toHaveFocus();
});

function SearchInsidePanel() {
  const [search, setSearch] = useState("");
  return (
    <SearchField
      label="Buscar entrega"
      placeholder="Buscar entrega"
      icon={<Search />}
      value={search}
      onChange={setSearch}
    />
  );
}

test.each(modes)(
  "keeps itself open when Escape clears a search field inside it, $mode",
  async ({ areaWidth }) => {
    const screen = await render(
      <SuppliersArea areaWidth={areaWidth}>
        <SearchInsidePanel />
      </SuppliersArea>,
    );
    await screen.getByRole("button", { name: "Almacén Sur" }).click();
    const search = screen.getByRole("searchbox", { name: "Buscar entrega" });
    await search.fill("Entrega 3");

    await userEvent.keyboard("{Escape}");

    await expect.element(search).toHaveValue("");
    await expect.element(screen.getByRole("complementary", { name: "Almacén Sur" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("complementary").elements()).toHaveLength(0);
  },
);

test.each(modes)(
  "keeps itself open when Escape closes the open list of a combo box inside it, $mode",
  async ({ areaWidth }) => {
    const screen = await render(
      <SuppliersArea areaWidth={areaWidth}>
        <ComboBox
          label="Rubro"
          options={[
            { value: "almacen", label: "Almacén" },
            { value: "bebidas", label: "Bebidas" },
          ]}
          value={null}
          onChange={() => {}}
        />
      </SuppliersArea>,
    );
    await screen.getByRole("button", { name: "Almacén Sur" }).click();
    await screen.getByRole("combobox", { name: "Rubro" }).click();
    await expect.element(screen.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.getByRole("listbox").elements().length).toBe(0);
    await expect.element(screen.getByRole("complementary", { name: "Almacén Sur" })).toBeVisible();
  },
);

test("closes on Escape while focus is on content inside it", async () => {
  const screen = await render(
    <SuppliersArea areaWidth={WIDE_AREA}>
      <button type="button">Editar datos</button>
    </SuppliersArea>,
  );
  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();

  await screen.getByRole("button", { name: "Editar datos" }).click();
  await userEvent.keyboard("{Escape}");

  expect(screen.getByRole("complementary").elements()).toHaveLength(0);
});

test("does not close on Escape pressed outside it, and leaves the list usable", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);
  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();
  const otherRow = screen.getByRole("button", { name: "Almacén Sur" });
  (otherRow.element() as HTMLElement).focus();

  await userEvent.keyboard("{Escape}");

  await expect
    .element(screen.getByRole("complementary", { name: "Distribuidora Norte" }))
    .toBeVisible();
});

test.each([true, false])(
  "keeps itself open when Escape is handled by a modal opened from its content (closable: %s)",
  async (closable) => {
    const screen = await render(
      <SuppliersArea areaWidth={WIDE_AREA}>
        <ConfirmationInsidePanel closable={closable} />
      </SuppliersArea>,
    );
    await screen.getByRole("button", { name: "Almacén Sur" }).click();
    await screen.getByRole("button", { name: "Eliminar proveedor" }).click();
    await expect.element(screen.getByRole("dialog")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("complementary", { name: "Almacén Sur" })).toBeVisible();
  },
);
