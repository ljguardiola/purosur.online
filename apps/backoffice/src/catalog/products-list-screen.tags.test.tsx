import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { honey } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openEditProductModal,
  renderScreen,
} from "./test-support/products-list-screen";
import { organico, sinTacc } from "./test-support/tags";

test("creating a tag leaves the catalog unread while the product form is open, and reads it once the form closes", async () => {
  const services = createServices();
  mockLoaded(services, [honey], undefined, [], [sinTacc]);
  vi.mocked(services.createTag).mockResolvedValue({ kind: "ok", tag: organico });
  const screen = await renderScreen(services);
  const productDialog = await openEditProductModal(screen, honey);
  const tagsReads = vi.mocked(services.fetchTags).mock.calls.length;
  const productsReads = vi.mocked(services.fetchProducts).mock.calls.length;

  await userEvent.click(productDialog.getByRole("button", { name: "Agregar distintivo" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Crear distintivo…" }));
  const tagDialog = screen.getByRole("dialog", { name: "Nuevo distintivo" });
  await expect.element(tagDialog).toBeVisible();
  await userEvent.fill(tagDialog.getByRole("textbox", { name: /^Nombre/ }), "Orgánico");
  await userEvent.click(tagDialog.getByRole("button", { name: "Crear el distintivo" }));
  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo distintivo" }).query())
    .toBeNull();

  expect(vi.mocked(services.fetchTags).mock.calls.length).toBe(tagsReads);
  expect(vi.mocked(services.fetchProducts).mock.calls.length).toBe(productsReads);
  vi.mocked(services.fetchTags).mockResolvedValue({ kind: "ok", value: [sinTacc, organico] });
  await userEvent.click(
    screen.getByRole("dialog", { name: honey.name }).getByRole("button", { name: "Cancelar" }),
  );
  await expect
    .poll(() => vi.mocked(services.fetchTags).mock.calls.length)
    .toBeGreaterThan(tagsReads);
});

test("the products screen fails to open when its tags fail to load", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.fetchTags).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
});
