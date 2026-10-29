import type { DiscountTargets } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  StubCategoryCreationModal,
  StubProductCreationModal,
} from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { EditDiscountModal, type EditDiscountModalServices } from "./edit-discount-modal";
import { productPicker } from "./test-support/discount-modal";
import { targetsWithCreatedProduct } from "./test-support/discount-target-creation";
import { discountTargets, yerbaOff } from "./test-support/discounts";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 1200);
});

function createServices(fetched: DiscountTargets): EditDiscountModalServices {
  return {
    editDiscount: vi.fn(),
    fetchDiscountTargets: vi.fn().mockResolvedValue({ kind: "ok", value: fetched }),
    createTag: vi.fn(),
  };
}

async function opened(services: EditDiscountModalServices, withCreation = true) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditDiscountModal
          target={yerbaOff}
          onClose={() => {}}
          onSaved={() => {}}
          onSessionEnded={() => {}}
          reload={() => Promise.resolve({ kind: "list_failed" })}
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
  const dialog = screen.getByRole("dialog", { name: "Yerba de septiembre" });
  await expect.element(productPicker(dialog)).toBeVisible();
  return { screen, dialog };
}

async function createFideos(
  screen: Awaited<ReturnType<typeof opened>>["screen"],
  dialog: Awaited<ReturnType<typeof opened>>["dialog"],
) {
  await userEvent.fill(productPicker(dialog), "Fideos nuevos");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Fideos nuevos»" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );
}

test("selects a product created from the selector once the cloud lists it for the benefit", async () => {
  const { screen, dialog } = await opened(
    createServices(targetsWithCreatedProduct("Fideos nuevos", ["PERCENT_OFF"])),
  );

  await createFideos(screen, dialog);

  await expect.element(productPicker(dialog)).toHaveValue("Fideos nuevos");
});

test("leaves the product empty and says so when the cloud does not list it for the benefit", async () => {
  const { screen, dialog } = await opened(
    createServices(targetsWithCreatedProduct("Fideos nuevos", ["BUY_N_PAY_M"])),
  );

  await createFideos(screen, dialog);

  await expect
    .element(
      dialog
        .getByText("Se creó el producto «Fideos nuevos», pero no puede recibir este beneficio.")
        .first(),
    )
    .toBeVisible();
  await expect.element(productPicker(dialog)).toHaveValue("");
});

test("offers no creation when the modal is given no way to create", async () => {
  const { dialog } = await opened(createServices(discountTargets), false);

  await userEvent.fill(productPicker(dialog), "Fideos nuevos");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear/ }).query()).toBeNull();
});
