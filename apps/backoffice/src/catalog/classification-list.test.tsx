import { dataColumn, FieldSizeProvider, useTableModel } from "@purosur/ui";
import { Tags } from "lucide-react";
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
}: Partial<
  Pick<
    ClassificationListProps<Item>,
    "filters" | "footer" | "empty" | "createStatus" | "children" | "onSearchChange" | "onCreate"
  >
> & { items?: Item[] }) {
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

test("titles the list with a heading of its label", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByRole("heading", { name: "Marcas", level: 2 })).toBeVisible();
});

test("stays within the height it is given and scrolls its rows inside the table, keeping its title and search in view", async () => {
  const items = Array.from({ length: 60 }, (_, index) => ({
    id: String(index),
    name: `Marca ${index}`,
  }));
  const screen = await render(
    <div style={{ height: 400, display: "flex", flexDirection: "column" }}>
      <Harness items={items} />
    </div>,
  );

  const heading = screen.getByRole("heading", { name: "Marcas", level: 2 });
  await expect.element(heading).toBeVisible();
  const section = heading.element().closest("section");
  if (section === null) {
    throw new Error("the list is not a section");
  }
  expect(section.getBoundingClientRect().height).toBeLessThanOrEqual(400);

  const lastRow = screen.getByText("Marca 59");
  lastRow.element().scrollIntoView();
  await expect.element(lastRow).toBeInViewport();
  await expect.element(heading).toBeInViewport();
  await expect.element(screen.getByPlaceholder("Buscar una marca")).toBeInViewport();
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
      empty={{
        icon: <Tags />,
        title: "Todavía no hay marcas",
        variant: "blank",
        description: "Creá la primera.",
      }}
    />,
  );

  await expect.element(screen.getByText("Todavía no hay marcas")).toBeVisible();
});
