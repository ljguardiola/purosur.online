import type { TagSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewTagModal, type NewTagModalServices } from "./new-tag-modal";
import { vegano } from "./test-support/tags";

function renderModal({
  createTag = vi.fn<NewTagModalServices["createTag"]>(),
  context = "Catálogo",
  onCreated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  createTag?: NewTagModalServices["createTag"];
  context?: string;
  onCreated?: (tag: TagSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewTagModal
          open
          context={context}
          services={{ createTag }}
          onCreated={onCreated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

async function submitName(screen: Awaited<ReturnType<typeof renderModal>>, name: string) {
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), name);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el distintivo" }));
  return dialog;
}

test("shows the eyebrow it is given, the title and the name field", async () => {
  const screen = await renderModal({ context: "Catálogo · Productos" });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Catálogo · Productos")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nuevo distintivo" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toBeVisible();
});

test("creates the tag with the name trimmed and hands the created tag over", async () => {
  const createTag = vi.fn<NewTagModalServices["createTag"]>().mockResolvedValue({
    kind: "ok",
    tag: vegano,
  });
  const onCreated = vi.fn();
  const screen = await renderModal({ createTag, onCreated });

  await submitName(screen, "  Vegano  ");

  expect(createTag).toHaveBeenCalledWith({ name: "Vegano" });
  await expect.poll(() => onCreated.mock.calls).toEqual([[vegano]]);
});

test("requires a name, and refuses one longer than 100 characters, without calling the API", async () => {
  const createTag = vi.fn<NewTagModalServices["createTag"]>();
  const screen = await renderModal({ createTag });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el distintivo" }));
  await expect.element(dialog.getByText("Ingresá el nombre del distintivo.")).toBeVisible();

  await submitName(screen, "a".repeat(101));
  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(createTag).not.toHaveBeenCalled();
});

test("shows that a tag with that name already exists, keeping the typed name", async () => {
  const createTag = vi.fn<NewTagModalServices["createTag"]>().mockResolvedValue({
    kind: "name_taken",
  });
  const screen = await renderModal({ createTag });

  const dialog = await submitName(screen, "vegano");

  await expect.element(dialog.getByText("Ya existe un distintivo con este nombre.")).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("vegano");
});

test("shows the failure notice, keeping the typed name", async () => {
  const createTag = vi.fn<NewTagModalServices["createTag"]>().mockResolvedValue({
    kind: "failed",
  });
  const screen = await renderModal({ createTag });

  const dialog = await submitName(screen, "Vegano");

  await expect.element(dialog.getByText("No se guardó el distintivo")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Vegano");
});

test("shows the rate-limited notice with the time to wait", async () => {
  const createTag = vi.fn<NewTagModalServices["createTag"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ createTag });

  const dialog = await submitName(screen, "Vegano");

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when creating finds no open session", async () => {
  const createTag = vi.fn<NewTagModalServices["createTag"]>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ createTag, onSessionEnded });

  await submitName(screen, "Vegano");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when creating comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/tags");
  const createTag = vi.fn<NewTagModalServices["createTag"]>().mockResolvedValue({
    kind: "forbidden",
  });
  const screen = await renderModal({ createTag });

  await submitName(screen, "Vegano");

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("cancel closes the modal without calling the API", async () => {
  const createTag = vi.fn<NewTagModalServices["createTag"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ createTag, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(createTag).not.toHaveBeenCalled();
});
