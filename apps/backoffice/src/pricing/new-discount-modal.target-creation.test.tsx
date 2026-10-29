import type { DiscountSummary, DiscountTargets } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  StubCategoryCreationModal,
  StubProductCreationModal,
} from "../platform/test-support/creation-parts";
import { radioLabel } from "../platform/test-support/radio-label";
import { vegano } from "../platform/test-support/tags";
import { render } from "../shell/test-support/render-with-router";
import { NewDiscountModal, type NewDiscountModalServices } from "./new-discount-modal";
import { productPicker } from "./test-support/discount-modal";
import {
  targetsWithCreatedCategory,
  targetsWithCreatedProduct,
  targetsWithCreatedTag,
} from "./test-support/discount-target-creation";
import { discountTargets } from "./test-support/discounts";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 1100);
});

function createServices(
  overrides: Partial<NewDiscountModalServices> = {},
): NewDiscountModalServices {
  return {
    createDiscount: vi.fn(),
    fetchDiscountTargets: vi.fn().mockResolvedValue({ kind: "ok", value: discountTargets }),
    createTag: vi.fn(),
    ...overrides,
  };
}

async function opened(
  services: NewDiscountModalServices,
  {
    withCreation = true,
    onSessionEnded = () => {},
  }: { withCreation?: boolean; onSessionEnded?: () => void } = {},
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewDiscountModal
          open
          onClose={() => {}}
          onCreated={(_discount: DiscountSummary) => {}}
          onSessionEnded={onSessionEnded}
          targets={discountTargets}
          services={services}
          {...(withCreation
            ? {
                creation: {
                  productCreationModal: StubProductCreationModal,
                  categoryCreationModal: StubCategoryCreationModal,
                },
              }
            : {})}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Nueva promoción" });
  await expect.element(productPicker(dialog)).toBeVisible();
  return { screen, dialog };
}

function listing(value: DiscountTargets) {
  return vi.fn().mockResolvedValue({ kind: "ok", value });
}

async function createProductNamed(
  screen: Awaited<ReturnType<typeof opened>>["screen"],
  dialog: Awaited<ReturnType<typeof opened>>["dialog"],
  name: string,
) {
  await userEvent.fill(productPicker(dialog), name);
  await userEvent.click(page.getByRole("option", { name: `Crear producto «${name}»` }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );
}

test("typing a product that does not exist offers creating it with the typed text", async () => {
  const { screen, dialog } = await opened(createServices());

  await userEvent.fill(productPicker(dialog), "Fideos nuevos");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Fideos nuevos»" }));

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Nuevo producto" })
        .getByText("Nombre tipeado: Fideos nuevos"),
    )
    .toBeVisible();
});

test("selects the created product once the cloud lists it for the chosen benefit", async () => {
  const fetchDiscountTargets = listing(
    targetsWithCreatedProduct("Fideos nuevos", ["PERCENT_OFF", "BUY_N_PAY_M"]),
  );
  const { screen, dialog } = await opened(createServices({ fetchDiscountTargets }));

  await createProductNamed(screen, dialog, "Fideos nuevos");

  await expect.element(productPicker(dialog)).toHaveValue("Fideos nuevos");
  expect(screen.getByText(/pero no puede recibir este beneficio/).query()).toBeNull();
});

test("leaves the product empty and says so when the cloud does not list it for the benefit", async () => {
  const fetchDiscountTargets = listing(targetsWithCreatedProduct("Fideos nuevos", ["BUY_N_PAY_M"]));
  const { screen, dialog } = await opened(createServices({ fetchDiscountTargets }));

  await createProductNamed(screen, dialog, "Fideos nuevos");

  await expect
    .element(
      dialog
        .getByText("Se creó el producto «Fideos nuevos», pero no puede recibir este beneficio.")
        .first(),
    )
    .toBeVisible();
  await expect.element(productPicker(dialog)).toHaveValue("");
});

test("leaves the product empty and says so when what the cloud offers cannot be read again", async () => {
  const fetchDiscountTargets = vi.fn().mockResolvedValue({ kind: "failed" });
  const { screen, dialog } = await opened(createServices({ fetchDiscountTargets }));

  await createProductNamed(screen, dialog, "Fideos nuevos");

  await expect
    .element(
      dialog
        .getByText("Se creó el producto «Fideos nuevos», pero no pudimos cargarlo para elegirlo.")
        .first(),
    )
    .toBeVisible();
  await expect.element(productPicker(dialog)).toHaveValue("");
});

test("ends the session when reading what the cloud offers again finds it ended", async () => {
  const onSessionEnded = vi.fn();
  const fetchDiscountTargets = vi.fn().mockResolvedValue({ kind: "unauthenticated" });
  const { screen, dialog } = await opened(createServices({ fetchDiscountTargets }), {
    onSessionEnded,
  });

  await createProductNamed(screen, dialog, "Fideos nuevos");

  await expect.poll(() => onSessionEnded).toHaveBeenCalledTimes(1);
});

test("creates a category from the category selector and selects it once listed", async () => {
  const fetchDiscountTargets = listing(targetsWithCreatedCategory("Fiambres"));
  const { screen, dialog } = await opened(createServices({ fetchDiscountTargets }));
  await userEvent.click(radioLabel(dialog, "Categoría"));

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Categoría/ }), "Fiambres");
  await userEvent.click(page.getByRole("option", { name: "Crear categoría «Fiambres»" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nueva categoría" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .element(dialog.getByRole("combobox", { name: /^Categoría/ }))
    .toHaveValue("Fiambres");
});

test("creates a tag from the tag selector with the typed name and selects it once listed", async () => {
  const created = { ...vegano, id: "7a600000-0000-4000-8000-0000000000aa", name: "Orgánico" };
  const createTag = vi.fn().mockResolvedValue({ kind: "ok", tag: created });
  const fetchDiscountTargets = listing(targetsWithCreatedTag(created.id, "Orgánico"));
  const { screen, dialog } = await opened(createServices({ createTag, fetchDiscountTargets }));
  await userEvent.click(radioLabel(dialog, "Distintivo"));

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Distintivo/ }), "Orgánico");
  await userEvent.click(page.getByRole("option", { name: "Crear distintivo «Orgánico»" }));
  const tagDialog = screen.getByRole("dialog", { name: "Nuevo distintivo" });
  await expect.element(tagDialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Orgánico");
  await userEvent.click(tagDialog.getByRole("button", { name: "Crear el distintivo" }));

  expect(createTag).toHaveBeenCalledWith({ name: "Orgánico" });
  await expect
    .element(dialog.getByRole("combobox", { name: /^Distintivo/ }))
    .toHaveValue("Orgánico");
});

test("offers no creation when the modal is given no way to create", async () => {
  const { dialog } = await opened(createServices(), { withCreation: false });

  await userEvent.fill(productPicker(dialog), "Fideos nuevos");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear/ }).query()).toBeNull();
});

test("offers no tag creation when the modal is given no way to create", async () => {
  const { dialog } = await opened(createServices(), { withCreation: false });
  await userEvent.click(radioLabel(dialog, "Distintivo"));

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Distintivo/ }), "Orgánico");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear/ }).query()).toBeNull();
});
