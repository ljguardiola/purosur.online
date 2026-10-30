import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { createBrand } from "./brand-creation-api";
import { NewBrandModal } from "./new-brand-modal";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function modalElement(open: boolean, initialName: string) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <NewBrandModal
          open={open}
          initialName={initialName}
          context="Marcas"
          createBrand={vi.fn<typeof createBrand>().mockResolvedValue({ kind: "failed" })}
          onCreated={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>
  );
}

test("opens with the initial name already in the name field, still editable", async () => {
  const screen = await render(modalElement(true, "Serenísima"));
  const name = screen.getByRole("dialog").getByRole("textbox", { name: /^Nombre/ });

  await expect.element(name).toHaveValue("Serenísima");
  await userEvent.fill(name, "Serenísima SA");
  await expect.element(name).toHaveValue("Serenísima SA");
});

test("opens empty when no initial name is given", async () => {
  const screen = await render(modalElement(true, ""));

  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("");
});

test("seeds the name again each time it opens", async () => {
  const screen = await render(modalElement(true, "Serenísima"));
  await userEvent.fill(screen.getByRole("dialog").getByRole("textbox", { name: /^Nombre/ }), "x");
  await screen.rerender(modalElement(false, "Serenísima"));

  await screen.rerender(modalElement(true, "Dulcor"));

  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Dulcor");
});
