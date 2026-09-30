import type { TagSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type TagsListFilters, tagsListFilters } from "./routes";
import { TagsListScreen } from "./tags-list-screen";
import type { TagsListScreenServices } from "./tags-list-services";
import { organico, sinColorantes, sinTacc, tagList, vegano } from "./test-support/tags";

function createServices(overrides: Partial<TagsListScreenServices> = {}): TagsListScreenServices {
  return {
    fetchTags: vi.fn(),
    createTag: vi.fn(),
    editTag: vi.fn(),
    deactivateTag: vi.fn(),
    reactivateTag: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: TagsListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = tagsListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: TagsListFilters;
    onFiltersChange?: (filters: TagsListFilters) => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <TagsListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function rowTexts(screen: Screen): string[] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

async function loaded(
  services: TagsListScreenServices,
  tags: TagSummary[],
  options = {},
  taggedProductCount = 0,
) {
  vi.mocked(services.fetchTags).mockResolvedValue({
    kind: "ok",
    value: tagList(tags, taggedProductCount),
  });
  const screen = await renderScreen(services, () => {}, options);
  await expect.element(screen.getByRole("table", { name: "Distintivos" })).toBeVisible();
  return screen;
}

test("shows the breadcrumb, heading, each active tag with its product count and state, and the totals", async () => {
  const services = createServices();
  const screen = await loaded(services, [sinTacc, vegano, sinColorantes], {}, 3);

  await expect.element(screen.getByText("Catálogo").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Distintivos", level: 1 }))
    .toBeVisible();
  await expect.poll(() => rowTexts(screen)).toEqual(["Sin TACC34Activo", "Vegano18Activo"]);
  await expect.element(screen.getByText("2 distintivos · 3 productos")).toBeVisible();
});

test("the state filter shows the inactive tags, or every tag, counting the inactive ones", async () => {
  const services = createServices();
  const screen = await loaded(services, [sinTacc, sinColorantes], {}, 37);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  await expect.poll(() => rowTexts(screen)).toEqual(["Sin colorantes3Inactivo"]);
  await expect.element(screen.getByText("1 distintivo · 1 inactivo · 37 productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect.element(screen.getByText("2 distintivos · 1 inactivo · 37 productos")).toBeVisible();
});

test("lists tags by name, and the products header orders them by how many products carry them", async () => {
  const services = createServices();
  const screen = await loaded(services, [vegano, sinTacc, organico]);

  await expect
    .poll(() => rowTexts(screen).map((text) => text.split(/\d/)[0]))
    .toEqual(["Orgánico", "Sin TACC", "Vegano"]);

  await userEvent.click(screen.getByRole("button", { name: "Productos" }));

  await expect
    .poll(() => rowTexts(screen).map((text) => text.split(/\d/)[0]))
    .toEqual(["Sin TACC", "Vegano", "Orgánico"]);
});

test("the search field filters the tags by name, case-insensitively", async () => {
  const services = createServices();
  const screen = await loaded(services, [sinTacc, vegano], {}, 40);

  await userEvent.fill(screen.getByPlaceholder("Buscar un distintivo"), "vEG");

  await expect.poll(() => rowTexts(screen).length).toBe(1);
  await expect.element(screen.getByText("1 distintivo · 40 productos")).toBeVisible();
});

test("shows the blank empty state when there are no tags yet, with no footer", async () => {
  const services = createServices();
  vi.mocked(services.fetchTags).mockResolvedValue({ kind: "ok", value: tagList([]) });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay distintivos")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        'Se cargan para marcar características como "Sin TACC" o "Vegano" en los productos.',
      ),
    )
    .toBeVisible();
  expect(screen.getByText(/0 distintivos/).query()).toBeNull();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  const screen = await loaded(services, [sinTacc]);

  await userEvent.fill(screen.getByPlaceholder("Buscar un distintivo"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a filtered empty state when no tag has the chosen state", async () => {
  const services = createServices();
  const screen = await loaded(services, [sinTacc], {
    filters: tagsListFilters.parse({ status: "inactive" }),
  });

  await expect.element(screen.getByText("No hay distintivos inactivos")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchTags>>>();
  vi.mocked(services.fetchTags)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los distintivos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Distintivos" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: tagList([sinTacc]) });
  await expect.element(screen.getByText("Sin TACC")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchTags).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the tags request comes back forbidden", async () => {
  window.history.pushState(null, "", "/tags");
  const services = createServices();
  vi.mocked(services.fetchTags).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("ends the session when the tags request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchTags).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("the create action stays available while the tags load, and after they fail to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchTags>>>();
  vi.mocked(services.fetchTags).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nuevo distintivo" })).toBeEnabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir los distintivos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nuevo distintivo" })).toBeEnabled();
});

test("the create action opens the new tag modal, and the created tag is listed", async () => {
  const services = createServices();
  const nuevo: TagSummary = { ...organico, id: "tag-9", name: "Sin conservantes", productCount: 0 };
  vi.mocked(services.fetchTags)
    .mockResolvedValueOnce({ kind: "ok", value: tagList([sinTacc]) })
    .mockResolvedValueOnce({ kind: "ok", value: tagList([sinTacc, nuevo]) });
  vi.mocked(services.createTag).mockResolvedValue({ kind: "ok", tag: nuevo });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Sin TACC")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo distintivo" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Catálogo", { exact: true })).toBeVisible();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Sin conservantes");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el distintivo" }));

  expect(services.createTag).toHaveBeenCalledWith({ name: "Sin conservantes" });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Sin conservantes")).toBeVisible();
});

test("cancel closes the new tag modal", async () => {
  const services = createServices();
  const screen = await loaded(services, [sinTacc]);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo distintivo" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("the edit action opens the tag's edit modal, and the saved rename is listed", async () => {
  const services = createServices();
  vi.mocked(services.editTag).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [sinTacc]);

  await userEvent.click(screen.getByRole("button", { name: "Editar el distintivo Sin TACC" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Sin TACC" })).toBeVisible();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Sin gluten");
  vi.mocked(services.fetchTags).mockResolvedValue({
    kind: "ok",
    value: tagList([{ ...sinTacc, name: "Sin gluten", version: 2 }]),
  });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editTag).toHaveBeenCalledWith("tag-1", { name: "Sin gluten", version: 1 });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Sin gluten")).toBeVisible();
});

test("a stale version's reload refills the edit modal from the list read again", async () => {
  const services = createServices();
  vi.mocked(services.editTag).mockResolvedValue({ kind: "stale_version" });
  const screen = await loaded(services, [sinTacc]);
  await userEvent.click(screen.getByRole("button", { name: "Editar el distintivo Sin TACC" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Este distintivo cambió mientras lo editabas"))
    .toBeVisible();
  vi.mocked(services.fetchTags).mockResolvedValue({
    kind: "ok",
    value: tagList([{ ...sinTacc, name: "Sin gluten", version: 5 }]),
  });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Sin gluten");
});

test("deactivating asks first, then deactivates the tag and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.deactivateTag).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [sinTacc, sinColorantes]);

  await userEvent.click(screen.getByRole("button", { name: "Desactivar el distintivo Sin TACC" }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: '¿Desactivar el distintivo "Sin TACC"?' }))
    .toBeVisible();
  vi.mocked(services.fetchTags).mockResolvedValue({
    kind: "ok",
    value: tagList([{ ...sinTacc, active: false, version: 2 }, sinColorantes]),
  });
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  expect(services.deactivateTag).toHaveBeenCalledWith("tag-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("No hay distintivos activos")).toBeVisible();
});

test("reactivating an inactive tag asks first, then reactivates it and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.reactivateTag).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [sinTacc, sinColorantes], {
    filters: tagsListFilters.parse({ status: "all" }),
  });
  expect(
    screen.getByRole("button", { name: "Desactivar el distintivo Sin colorantes" }).query(),
  ).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Reactivar el distintivo Sin colorantes" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: '¿Reactivar el distintivo "Sin colorantes"?' }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  expect(services.reactivateTag).toHaveBeenCalledWith("tag-3");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchTags).mock.calls.length).toBe(2);
});

test("updating the list after a tag was already deactivated closes the question and reads the list again", async () => {
  const services = createServices();
  vi.mocked(services.deactivateTag).mockResolvedValue({ kind: "already_changed" });
  const screen = await loaded(services, [sinTacc]);
  await userEvent.click(screen.getByRole("button", { name: "Desactivar el distintivo Sin TACC" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchTags).mock.calls.length).toBe(2);
});

test("opens with the filters it is given, and reports every change to them", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [sinTacc, vegano, sinColorantes], {
    filters: { search: "veg", status: "all", sortBy: "products", sort: "descending" },
    onFiltersChange,
  });

  await expect.element(screen.getByPlaceholder("Buscar un distintivo")).toHaveValue("veg");
  await expect.poll(() => rowTexts(screen)).toHaveLength(1);
  expect(onFiltersChange).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByPlaceholder("Buscar un distintivo"), "");
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sortBy: "products", sort: "descending" });

  await userEvent.click(screen.getByRole("button", { name: "Distintivo" }));
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sortBy: "tag", sort: "ascending" });
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  const screen = await loaded(services, [sinTacc, sinColorantes], {
    filters: tagsListFilters.parse({ status: "all" }),
  });

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo distintivo" }));
  await expectNoAccessibilityViolations(document.body);
});
