import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { groceries, spreads } from "../platform/test-support/categories";
import { render } from "../shell/test-support/render-with-router";
import { CategoryCreationModal } from "./category-creation-modal";
import type { CategoryCreationModalServices } from "./category-creation-modal-services";

function createServices(): CategoryCreationModalServices {
  return {
    fetchCategories: vi.fn().mockResolvedValue({ kind: "ok", value: [groceries] }),
    createCategory: vi.fn().mockResolvedValue({ kind: "ok", category: spreads }),
  };
}

function renderPart(
  services: CategoryCreationModalServices,
  options: { open?: boolean; onCreated?: () => void } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CategoryCreationModal
          open={options.open ?? true}
          initialName="Fiambres"
          onCreated={options.onCreated ?? (() => {})}
          onClose={() => {}}
          onSessionEnded={() => {}}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("shows nothing while closed, without reading the categories", async () => {
  const services = createServices();
  const screen = await renderPart(services, { open: false });

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchCategories).not.toHaveBeenCalled();
});

test("opens the new category form with the typed name and the stored categories as parents", async () => {
  const screen = await renderPart(createServices());

  const dialog = screen.getByRole("dialog", { name: "Nueva categoría" });
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }))
    .toHaveValue("Fiambres");
  await userEvent.click(dialog.getByRole("combobox", { name: /Categoría superior/ }));
  await expect.element(page.getByRole("option", { name: "Almacén" })).toBeVisible();
});

test("hands back the category it created", async () => {
  const services = createServices();
  const onCreated = vi.fn();
  const screen = await renderPart(services, { onCreated });
  const dialog = screen.getByRole("dialog", { name: "Nueva categoría" });

  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(services.createCategory).toHaveBeenCalledWith({ name: "Fiambres", parentId: null });
  expect(onCreated).toHaveBeenCalledWith(spreads);
});
