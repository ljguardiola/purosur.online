import type { TagSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { TagReload } from "./catalog-queries";
import { EditTagModal, type EditTagModalServices } from "./edit-tag-modal";
import { organico, sinTacc } from "./test-support/tags";

function renderModal({
  target = sinTacc,
  editTag = vi.fn<EditTagModalServices["editTag"]>(),
  reload = vi.fn<(id: string) => Promise<TagReload>>(),
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  target?: TagSummary;
  editTag?: EditTagModalServices["editTag"];
  reload?: (id: string) => Promise<TagReload>;
  onSaved?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditTagModal
          target={target}
          onClose={onClose}
          onSaved={onSaved}
          onSessionEnded={onSessionEnded}
          reload={reload}
          services={{ editTag }}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function save(screen: ModalScreen, name?: string) {
  const dialog = screen.getByRole("dialog");
  if (name !== undefined) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), name);
  }
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  return dialog;
}

test("opens on the tag's name, titled with it, saying how many products show it", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Catálogo · Distintivos")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Sin TACC" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Sin TACC");
  await expect
    .element(dialog.getByText("El nombre nuevo se ve en sus 34 productos."))
    .toBeVisible();
});

test("names the one product a tag is on, and says nothing about products for a tag on none", async () => {
  const one = await renderModal({ target: organico });
  await expect
    .element(one.getByRole("dialog").getByText("El nombre nuevo se ve en su producto."))
    .toBeVisible();
  await one.unmount();

  const none = await renderModal({ target: { ...organico, productCount: 0 } });
  await expect.element(none.getByRole("dialog").getByRole("textbox")).toHaveValue("Orgánico");
  expect(
    none
      .getByRole("dialog")
      .getByText(/El nombre nuevo/)
      .query(),
  ).toBeNull();
});

test("saves the rename with the name trimmed and the version it opened at", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ editTag, onSaved });

  await save(screen, " Sin gluten ");

  expect(editTag).toHaveBeenCalledWith("tag-1", { name: "Sin gluten", version: 1 });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("requires a name, and refuses one longer than 100 characters, without calling the API", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>();
  const screen = await renderModal({ editTag });
  const dialog = screen.getByRole("dialog");

  await save(screen, "");
  await expect.element(dialog.getByText("Ingresá el nombre del distintivo.")).toBeVisible();

  await save(screen, "a".repeat(101));
  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(editTag).not.toHaveBeenCalled();
});

test("a rename to a name another tag has shows the error in place of the products line", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({
    kind: "name_taken",
  });
  const screen = await renderModal({ editTag });

  const dialog = await save(screen, "Vegano");

  await expect.element(dialog.getByText("Ya existe un distintivo con este nombre.")).toBeVisible();
  expect(dialog.getByText("El nombre nuevo se ve en sus 34 productos.").query()).toBeNull();
});

test("a stale version asks to reload, and reloading refills the form from the fresh tag and saves over its version", async () => {
  const editTag = vi
    .fn<EditTagModalServices["editTag"]>()
    .mockResolvedValueOnce({ kind: "stale_version" })
    .mockResolvedValueOnce({ kind: "ok" });
  const reload = vi.fn<(id: string) => Promise<TagReload>>().mockResolvedValue({
    kind: "found",
    tag: { ...sinTacc, name: "Sin gluten", version: 5 },
  });
  const screen = await renderModal({ editTag, reload });
  const dialog = await save(screen, "Sin TACC 2");

  await expect
    .element(dialog.getByText("Este distintivo cambió mientras lo editabas"))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Sin gluten");
  await expect.element(dialog.getByRole("heading", { name: "Sin gluten" })).toBeVisible();
  await save(screen);
  expect(editTag).toHaveBeenLastCalledWith("tag-1", { name: "Sin gluten", version: 5 });
});

test("reloading a tag that no longer exists says so", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({
    kind: "stale_version",
  });
  const reload = vi
    .fn<(id: string) => Promise<TagReload>>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ editTag, reload });
  const dialog = await save(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este distintivo ya no existe");
});

test("shows a not-found notice when the tag no longer exists", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({
    kind: "not_found",
  });
  const screen = await renderModal({ editTag });

  const dialog = await save(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este distintivo ya no existe");
});

test("shows the failure notice", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ editTag });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se guardó el distintivo")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ editTag });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ editTag, onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/tags");
  const editTag = vi.fn<EditTagModalServices["editTag"]>().mockResolvedValue({
    kind: "forbidden",
  });
  const screen = await renderModal({ editTag });

  await save(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("cancel closes the modal without calling the API", async () => {
  const editTag = vi.fn<EditTagModalServices["editTag"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ editTag, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(editTag).not.toHaveBeenCalled();
});
