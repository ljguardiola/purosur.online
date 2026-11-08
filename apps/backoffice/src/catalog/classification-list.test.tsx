import { dataColumn, FieldSizeProvider, useTableModel } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { ClassificationList, type ClassificationListProps } from "./classification-list";

type Item = { id: string; name: string };

const ITEMS: Item[] = [
  { id: "1", name: "Alma" },
  { id: "2", name: "Vitora" },
];

function Harness({
  items = ITEMS,
  ...props
}: Partial<Omit<ClassificationListProps<Item>, "table">> & { items?: Item[] }) {
  const table = useTableModel({
    items,
    id: (item) => item.id,
    columns: [dataColumn({ id: "name", header: "Nombre", render: (item: Item) => item.name })],
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ClassificationList
          label="Marcas"
          searchPlaceholder="Buscar una marca"
          search=""
          onSearchChange={() => {}}
          createLabel="Nueva marca"
          onCreate={() => {}}
          table={table}
          loading={false}
          {...props}
        />
      </main>
    </FieldSizeProvider>
  );
}

test("shows the search field, the create button and the labelled table with its rows", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByPlaceholder("Buscar una marca")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva marca" })).toBeVisible();
  const table = screen.getByRole("table", { name: "Marcas" });
  await expect.element(table.getByText("Alma")).toBeVisible();
  await expect.element(table.getByText("Vitora")).toBeVisible();
});

test("reports what is typed in the search field and the press of the create button", async () => {
  const onSearchChange = vi.fn();
  const onCreate = vi.fn();
  const screen = await render(<Harness onSearchChange={onSearchChange} onCreate={onCreate} />);

  await userEvent.type(screen.getByPlaceholder("Buscar una marca"), "a");
  await userEvent.click(screen.getByRole("button", { name: "Nueva marca" }));

  expect(onSearchChange).toHaveBeenCalledWith("a");
  expect(onCreate).toHaveBeenCalledOnce();
});

test("shows the filters between the search field and the create button, and the footer under the table", async () => {
  const screen = await render(
    <Harness filters={<p>Estado: Activas</p>} footer={<p>2 marcas</p>} />,
  );

  await expect.element(screen.getByText("Estado: Activas")).toBeVisible();
  await expect.element(screen.getByText("2 marcas")).toBeVisible();
});

test("keeps the list visible beside the modals it is given", async () => {
  const screen = await render(
    <Harness>
      <p>Un modal abierto</p>
    </Harness>,
  );

  await expect.element(screen.getByText("Un modal abierto")).toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Marcas" })).toBeVisible();
});

test("disables the create button until the list is loaded when it is told the load status", async () => {
  const screen = await render(<Harness createStatus="loading" />);

  await expect.element(screen.getByRole("button", { name: "Nueva marca" })).toBeDisabled();
});

test("leaves the create button available when it is told no load status", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByRole("button", { name: "Nueva marca" })).toBeEnabled();
});

test("shows the empty state it is given when there are no rows", async () => {
  const screen = await render(
    <Harness
      items={[]}
      empty={{ title: "Todavía no hay marcas", variant: "blank", description: "Creá la primera." }}
    />,
  );

  await expect.element(screen.getByText("Todavía no hay marcas")).toBeVisible();
});
