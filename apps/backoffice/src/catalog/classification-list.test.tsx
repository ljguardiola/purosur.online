import { dataColumn, FieldSizeProvider, useTableModel } from "@purosur/ui";
import { CircleAlert, Tags } from "lucide-react";
import { expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import type { CloudTableState } from "../platform/cloud-table-state";
import { render } from "../shell/test-support/render-with-router";
import { ClassificationList, type ClassificationListProps } from "./classification-list";

type Item = { id: string; name: string };

const ITEMS: Item[] = [
  { id: "1", name: "Alma" },
  { id: "2", name: "Vitora" },
];

function Harness({
  items = ITEMS,
  state = { loading: false },
  ...props
}: Partial<
  Pick<
    ClassificationListProps<Item>,
    "filters" | "footer" | "empty" | "createStatus" | "children" | "onSearchChange" | "onCreate"
  >
> & { items?: Item[]; state?: CloudTableState }) {
  const table = useTableModel({
    items,
    id: (item) => item.id,
    columns: [dataColumn({ id: "name", header: "Nombre", render: (item: Item) => item.name })],
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main className="flex min-h-0 flex-1 flex-col">
        <ClassificationList
          label="Marcas"
          searchPlaceholder="Buscar una marca"
          search=""
          onSearchChange={() => {}}
          createLabel="Nueva marca"
          onCreate={() => {}}
          table={table}
          {...state}
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

test("keeps its footer under the table inside the height it is given", async () => {
  const items = Array.from({ length: 60 }, (_, index) => ({
    id: String(index),
    name: `Marca ${index}`,
  }));
  const screen = await render(
    <div style={{ height: 400, display: "flex", flexDirection: "column" }}>
      <Harness items={items} footer={<p>60 marcas</p>} />
    </div>,
  );

  const footer = screen.getByText("60 marcas");
  await expect.element(footer).toBeVisible();
  const section = screen
    .getByRole("heading", { name: "Marcas", level: 2 })
    .element()
    .closest("section");
  if (section === null) {
    throw new Error("the list is not a section");
  }
  const table = screen.getByRole("table", { name: "Marcas" }).element();
  expect(footer.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(
    section.getBoundingClientRect().bottom,
  );
  expect(table.getBoundingClientRect().top).toBeLessThan(
    footer.element().getBoundingClientRect().top,
  );
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

test("shows the filters beside the search field, and the footer under the table", async () => {
  const screen = await render(
    <Harness filters={<p>Estado: Activas</p>} footer={<p>2 marcas</p>} />,
  );

  const filters = screen.getByText("Estado: Activas");
  await expect.element(filters).toBeVisible();
  await expect.element(screen.getByText("2 marcas")).toBeVisible();
  const filtersBox = filters.element().getBoundingClientRect();
  const searchBox = screen.getByPlaceholder("Buscar una marca").element().getBoundingClientRect();
  expect(filtersBox.left).toBeGreaterThanOrEqual(searchBox.right);
  expect(filtersBox.top).toBeLessThan(searchBox.bottom);
  expect(filtersBox.bottom).toBeGreaterThan(searchBox.top);
});

test("places the create button in the list's title row, beside its heading and above the search field", async () => {
  const screen = await render(<Harness />);

  const button = screen.getByRole("button", { name: "Nueva marca" });
  await expect.element(button).toBeVisible();
  const buttonBox = button.element().getBoundingClientRect();
  const headingBox = screen
    .getByRole("heading", { name: "Marcas", level: 2 })
    .element()
    .getBoundingClientRect();
  const searchBox = screen.getByPlaceholder("Buscar una marca").element().getBoundingClientRect();
  expect(buttonBox.left).toBeGreaterThanOrEqual(headingBox.right);
  expect(buttonBox.top).toBeLessThan(headingBox.bottom);
  expect(buttonBox.bottom).toBeGreaterThan(headingBox.top);
  expect(buttonBox.bottom).toBeLessThanOrEqual(searchBox.top);
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

function borderedBox(text: HTMLElement): DOMRect {
  let box: HTMLElement | null = null;
  for (
    let element: HTMLElement | null = text;
    element !== null && element.tagName !== "SECTION";
    element = element.parentElement
  ) {
    if (getComputedStyle(element).borderTopWidth !== "0px") {
      box = element;
    }
  }
  if (box === null) {
    throw new Error("the text is not inside a bordered box of the list");
  }
  return box.getBoundingClientRect();
}

test("an empty list leaves its footer's place, so its box ends on the same line as a list with a footer", async () => {
  const column = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } as const;
  const screen = await render(
    <div style={{ height: 400, display: "flex", gap: 24 }}>
      <div style={column}>
        <Harness footer={<p className="text-detail">2 marcas</p>} />
      </div>
      <div style={column}>
        <Harness
          items={[]}
          empty={{ icon: <Tags />, title: "Todavía no hay marcas", variant: "blank" }}
        />
      </div>
    </div>,
  );

  const emptyTitle = screen.getByText("Todavía no hay marcas");
  await expect.element(emptyTitle).toBeVisible();
  await expect.element(screen.getByText("2 marcas")).toBeVisible();
  const withFooter = borderedBox(screen.getByText("Alma").element() as HTMLElement);
  const empty = borderedBox(emptyTitle.element() as HTMLElement);

  expect(empty.bottom).toBeCloseTo(withFooter.bottom, 0);
});

test.each<{ case: string; state: CloudTableState; anchor: (list: Locator) => Locator }>([
  {
    case: "on its first load",
    state: { loading: "initial" },
    anchor: (list) => list.getByRole("table", { name: "Marcas" }),
  },
  {
    case: "whose load failed",
    state: {
      failure: {
        icon: <CircleAlert />,
        title: "No se pudieron cargar las marcas",
        onRetry: () => {},
      },
    },
    anchor: (list) => list.getByRole("button", { name: "Reintentar" }),
  },
])(
  "a list $case leaves its footer's place, so its box ends on the same line as a list with a footer",
  async ({ state, anchor }) => {
    const column = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } as const;
    const screen = await render(
      <div style={{ height: 400, display: "flex", gap: 24 }}>
        <div style={column}>
          <Harness footer={<p className="text-detail">2 marcas</p>} />
        </div>
        <div style={column} data-testid="other-list">
          <Harness items={[]} state={state} />
        </div>
      </div>,
    );

    await expect.element(screen.getByText("2 marcas")).toBeVisible();
    const otherAnchor = anchor(screen.getByTestId("other-list"));
    await expect.element(otherAnchor).toBeInTheDocument();
    const withFooter = borderedBox(screen.getByText("Alma").element() as HTMLElement);
    const other = borderedBox(otherAnchor.element() as HTMLElement);

    expect(other.bottom).toBeCloseTo(withFooter.bottom, 0);
  },
);
