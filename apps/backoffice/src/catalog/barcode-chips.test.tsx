import { productCreationBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import { afterEach, expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  BarcodeChips,
  PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  useBarcodeChips,
  useGenerateInternalBarcode,
} from "./barcode-chips";
import {
  barcodeProblemMessage,
  EMPTY_PRODUCT_FORM,
  PRODUCT_MESSAGES,
  productRequestFrom,
} from "./product-form";
import type { GenerateInternalBarcodeOutcome, generateInternalBarcode } from "./products-api";
import { scanInputOf } from "./test-support/product-form";

type HarnessProps = {
  initialCodes: string[];
  generateInternalBarcode: typeof generateInternalBarcode;
  onSessionEnded: () => void;
};

// Stands in for a product modal: the product form with only its barcodes field shown, and a submit.
function Harness({ initialCodes, generateInternalBarcode, onSessionEnded }: HarnessProps) {
  const { form, submit, values } = useRequestForm({
    defaultValues: { ...EMPTY_PRODUCT_FORM, barcodes: { codes: initialCodes, scan: "" } },
    request: { schema: productCreationBodySchema, from: productRequestFrom },
    fields: {
      name: null,
      categoryId: null,
      brandId: null,
      saleUnit: null,
      netContent: null,
      tagIds: null,
      barcodes: "barcodes",
    },
    messages: { barcodes: PRODUCT_MESSAGES.barcodes },
    onSubmit: async () => {},
  });
  const chips = useBarcodeChips({
    list: values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
    problemMessage: barcodeProblemMessage,
  });
  const generate = useGenerateInternalBarcode(
    chips,
    generateInternalBarcode,
    onSessionEnded,
    () => {},
    () => {},
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <form.AppField name="barcodes">
          {() => <BarcodeChips chips={chips} generation={generate.generation} />}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </main>
    </FieldSizeProvider>
  );
}

async function renderChips({
  initialCodes = [],
  generate = vi.fn<typeof generateInternalBarcode>(),
  onSessionEnded = () => {},
}: {
  initialCodes?: string[];
  generate?: typeof generateInternalBarcode;
  onSessionEnded?: () => void;
} = {}) {
  const screen = await render(
    <Harness
      initialCodes={initialCodes}
      generateInternalBarcode={generate}
      onSessionEnded={onSessionEnded}
    />,
  );
  return screen.locator;
}

afterEach(() => {
  window.history.pushState(null, "", "/");
});

async function scan(chips: Locator, code: string) {
  await userEvent.fill(scanInputOf(chips), code);
  await userEvent.keyboard("{Enter}");
}

function generateButtonOf(chips: Locator) {
  return chips.getByRole("button", { name: "Generar código interno" });
}

function pendingGenerate() {
  let resolveGenerate: (outcome: GenerateInternalBarcodeOutcome) => void = () => {};
  const generate = vi.fn<typeof generateInternalBarcode>().mockReturnValue(
    new Promise((resolve) => {
      resolveGenerate = resolve;
    }),
  );
  return {
    generate,
    resolveGenerate: (outcome: GenerateInternalBarcodeOutcome) => resolveGenerate(outcome),
  };
}

test("rejects scanning a code with spaces inside it, without adding a chip", async () => {
  const chips = await renderChips();

  await scan(chips, "779 0001");

  await expect
    .element(chips.getByText("El código de barras no puede tener espacios."))
    .toBeVisible();
  expect(chips.getByRole("button", { name: /^Quitar el código/ }).query()).toBeNull();
});

test("shows the barcode-too-long error when scanning, without listing the code", async () => {
  const chips = await renderChips();

  await scan(chips, "1".repeat(65));

  await expect
    .element(chips.getByText("El código de barras puede tener hasta 64 caracteres."))
    .toBeVisible();
  expect(chips.getByRole("button", { name: /^Quitar el código/ }).query()).toBeNull();
});

test("refuses scanning more than 20 codes for one product", async () => {
  const chips = await renderChips();

  for (let index = 1; index <= 21; index += 1) {
    await scan(chips, `code-${index}`);
  }

  await expect
    .element(chips.getByText("El producto puede tener hasta 20 códigos de barras."))
    .toBeVisible();
  expect(chips.getByRole("button", { name: /^Quitar el código/ }).elements()).toHaveLength(20);
});

test("rejects adding an already-listed barcode inline, keeping a single chip", async () => {
  const chips = await renderChips();

  await scan(chips, "7790000000099");
  await scan(chips, "7790000000099");

  await expect.element(chips.getByText("Ese código ya está en la lista.")).toBeVisible();
  expect(
    chips.getByRole("button", { name: "Quitar el código 7790000000099" }).elements(),
  ).toHaveLength(1);
});

test("the scan input is marked invalid and described by the barcode field's error", async () => {
  const chips = await renderChips();
  await expect.element(scanInputOf(chips)).not.toHaveAttribute("aria-invalid", "true");

  await userEvent.click(chips.getByRole("button", { name: "Enviar" }));
  await expect.element(scanInputOf(chips)).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(scanInputOf(chips))
    .toHaveAccessibleDescription("Escaneá al menos un código de barras.");

  await scan(chips, "779 0001");
  await expect
    .element(scanInputOf(chips))
    .toHaveAccessibleDescription(/El código de barras no puede tener espacios\./);
});

test("removing a chip clears the barcode-limit error once the product is back under the limit", async () => {
  const chips = await renderChips();
  for (let index = 1; index <= 21; index += 1) {
    await scan(chips, `code-${index}`);
  }
  const limitError = chips.getByText("El producto puede tener hasta 20 códigos de barras.");
  await expect.element(limitError).toBeVisible();

  await userEvent.click(chips.getByRole("button", { name: "Quitar el código code-1" }));

  await expect.poll(() => limitError.query()).toBeNull();
  await expect.element(scanInputOf(chips)).not.toHaveAttribute("aria-invalid", "true");
});

test("editing the scan input clears the previous scan error", async () => {
  const chips = await renderChips();
  await scan(chips, "779 0001");
  const spacesError = chips.getByText("El código de barras no puede tener espacios.");
  await expect.element(spacesError).toBeVisible();

  await userEvent.fill(scanInputOf(chips), "7790001");

  await expect.poll(() => spacesError.query()).toBeNull();
  await expect.element(scanInputOf(chips)).not.toHaveAttribute("aria-invalid", "true");
});

test("removing an unrelated chip keeps the error of a code still invalid in the scan input", async () => {
  const chips = await renderChips();
  await scan(chips, "7790001");
  await scan(chips, "779 0002");
  const spacesError = chips.getByText("El código de barras no puede tener espacios.");
  await expect.element(spacesError).toBeVisible();

  await userEvent.click(chips.getByRole("button", { name: "Quitar el código 7790001" }));

  await expect.element(spacesError).toBeVisible();
  await expect.element(scanInputOf(chips)).toHaveAttribute("aria-invalid", "true");
});

function scanPlaceholderOf(chips: Locator) {
  return chips.getByText("Escanear otro código", { exact: true });
}

async function moveFocusOutOfScanInput(chips: Locator) {
  await userEvent.click(chips.getByRole("button", { name: "Enviar" }));
}

test("shows the scan placeholder only while the scan input is empty", async () => {
  const chips = await renderChips();
  const input = scanInputOf(chips).element() as HTMLInputElement;
  await expect.element(scanPlaceholderOf(chips)).toBeVisible();

  await userEvent.fill(scanInputOf(chips), "7790001");
  await moveFocusOutOfScanInput(chips);
  await expect.poll(() => scanPlaceholderOf(chips).query()).toBeNull();

  input.focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(chips.getByText("7790001")).toBeVisible();
  await moveFocusOutOfScanInput(chips);

  await expect.element(scanPlaceholderOf(chips)).toBeVisible();
});

test("hides the scan placeholder while the empty scan input has focus", async () => {
  const chips = await renderChips();
  const input = scanInputOf(chips).element() as HTMLInputElement;
  await expect.element(scanPlaceholderOf(chips)).toBeVisible();

  input.focus();
  await expect.poll(() => scanPlaceholderOf(chips).query()).toBeNull();

  await moveFocusOutOfScanInput(chips);
  await expect.element(scanPlaceholderOf(chips)).toBeVisible();
});

test("rings the whole scan control while its input has keyboard focus", async () => {
  const chips = await renderChips();
  const input = scanInputOf(chips).element() as HTMLInputElement;
  const control = scanControlOf(chips);
  expect(getComputedStyle(control).outlineStyle).toBe("none");

  input.focus();

  await expect.poll(() => getComputedStyle(control).outlineStyle).toBe("solid");
  expect(getComputedStyle(control).outlineWidth).toBe("3px");
});

test("ends each barcode row with a borderless remove button centred in the row, 6px from its right edge", async () => {
  const chips = await renderChips();
  await scan(chips, "7790001");

  const remove = chips.getByRole("button", { name: "Quitar el código 7790001" });
  await expect.element(remove).toBeVisible();
  const button = remove.element() as HTMLElement;
  const row = button.parentElement as HTMLElement;
  const buttonRect = button.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const codeRect = chips.getByText("7790001", { exact: true }).element().getBoundingClientRect();

  expect(getComputedStyle(button).borderWidth).toBe("0px");
  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(rowRect.height).toBe(44);
  expect(buttonRect.top - rowRect.top).toBe(rowRect.bottom - buttonRect.bottom);
  expect(rowRect.right - buttonRect.right).toBe(6);
  expect(codeRect.left - rowRect.left).toBe(12);
  expect(buttonRect.left - codeRect.right).toBe(8);
});

test("disables the generate button while its request is pending", async () => {
  const { generate, resolveGenerate } = pendingGenerate();
  const chips = await renderChips({ generate });
  const generateButton = generateButtonOf(chips);
  await expect.element(generateButton).not.toBeDisabled();

  await userEvent.click(generateButton);
  await expect.element(generateButton).toBeDisabled();

  resolveGenerate({ kind: "failed" });
  await expect.element(generateButton).not.toBeDisabled();
});

test("asks for an internal code with the barcodes listed", async () => {
  const generate = vi
    .fn<typeof generateInternalBarcode>()
    .mockResolvedValue({ kind: "ok", code: "2000000000015" });
  const chips = await renderChips({ generate });

  await userEvent.click(generateButtonOf(chips));

  await expect.element(chips.getByText("2000000000015")).toBeVisible();
  expect(generate).toHaveBeenCalledWith({ barcodes: [] });
});

test("offers generating an internal code only while no barcode is listed", async () => {
  const generate = vi
    .fn<typeof generateInternalBarcode>()
    .mockResolvedValue({ kind: "ok", code: "2000000000015" });
  const chips = await renderChips({ generate });
  const generateButton = generateButtonOf(chips);
  await expect.element(generateButton).not.toBeDisabled();

  await userEvent.click(generateButton);
  await expect.element(chips.getByText("2000000000015")).toBeVisible();
  await expect.element(generateButton).toBeDisabled();

  await userEvent.click(chips.getByRole("button", { name: "Quitar el código 2000000000015" }));
  await expect.element(generateButton).not.toBeDisabled();

  await scan(chips, "7790987000015");
  await expect.element(generateButton).toBeDisabled();
});

test("refuses scanning a second internal code, without listing it", async () => {
  const chips = await renderChips({ initialCodes: ["2000000000015"] });

  await scan(chips, "2000000000022");

  await expect
    .element(chips.getByText("El producto puede tener un solo código interno."))
    .toBeVisible();
  expect(chips.getByRole("button", { name: /^Quitar el código/ }).elements()).toHaveLength(1);
});

test("stops offering generation once an internal code is scanned", async () => {
  const chips = await renderChips();

  await scan(chips, "2000000000022");

  await expect.element(chips.getByText("2000000000022")).toBeVisible();
  await expect.element(generateButtonOf(chips)).toBeDisabled();
});

test("refuses scanning another code beside an internal one, without listing it", async () => {
  const chips = await renderChips({ initialCodes: ["2000000000015"] });

  await scan(chips, "7790987000015");

  await expect
    .element(chips.getByText("El código interno tiene que ser el único del producto."))
    .toBeVisible();
  expect(chips.getByRole("button", { name: /^Quitar el código/ }).elements()).toHaveLength(1);
});

function scanControlOf(chips: Locator) {
  const control = scanInputOf(chips).element().parentElement;
  if (!control) {
    throw new Error("the scan input has no enclosing control");
  }
  return control;
}

test("keeps the list from changing while an internal code is being generated", async () => {
  const { generate, resolveGenerate } = pendingGenerate();
  const chips = await renderChips({ generate });
  await expect.element(scanInputOf(chips)).not.toBeDisabled();

  await userEvent.click(generateButtonOf(chips));
  await expect.element(scanInputOf(chips)).toBeDisabled();

  resolveGenerate({ kind: "ok", code: "2000000000015" });
  await expect.element(chips.getByText("2000000000015")).toBeVisible();
  await expect.element(scanInputOf(chips)).not.toBeDisabled();
});

test("dims the scan control while the list cannot change, as the disabled generate button", async () => {
  const { generate, resolveGenerate } = pendingGenerate();
  const chips = await renderChips({ generate });
  const control = scanControlOf(chips);
  expect(getComputedStyle(control).opacity).toBe("1");

  await userEvent.click(generateButtonOf(chips));
  await expect.element(scanInputOf(chips)).toBeDisabled();

  expect(getComputedStyle(control).opacity).toBe(
    getComputedStyle(generateButtonOf(chips).element()).opacity,
  );
  resolveGenerate({ kind: "failed" });
});

test("fills the scan control on hover only while its input is enabled", async () => {
  const { generate, resolveGenerate } = pendingGenerate();
  const chips = await renderChips({ generate });
  const control = scanControlOf(chips);
  const unfilled = getComputedStyle(control).backgroundColor;
  await userEvent.hover(control);
  await expect.poll(() => getComputedStyle(control).backgroundColor).not.toBe(unfilled);
  await userEvent.unhover(control);
  await expect.poll(() => getComputedStyle(control).backgroundColor).toBe(unfilled);

  await userEvent.click(generateButtonOf(chips));
  await expect.element(scanInputOf(chips)).toBeDisabled();
  await userEvent.hover(control);
  // Forces a style recalc to capture any started transition, then finishes it: a transition
  // begins at its from-value, so reading it too soon looks the same as never starting.
  getComputedStyle(control).backgroundColor;
  for (const animation of control.getAnimations()) {
    animation.finish();
  }

  expect(getComputedStyle(control).backgroundColor).toBe(unfilled);
  resolveGenerate({ kind: "failed" });
});

test("ends the session when generating finds no open session", async () => {
  const generate = vi
    .fn<typeof generateInternalBarcode>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const chips = await renderChips({ generate, onSessionEnded });

  await userEvent.click(generateButtonOf(chips));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when generating comes back forbidden", async () => {
  window.history.pushState(null, "", "/products");
  const generate = vi.fn<typeof generateInternalBarcode>().mockResolvedValue({ kind: "forbidden" });
  const chips = await renderChips({ generate });

  await userEvent.click(generateButtonOf(chips));

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("describes the generate button with its failure, so a screen reader announces it", async () => {
  const generate = vi.fn<typeof generateInternalBarcode>().mockResolvedValue({ kind: "failed" });
  const chips = await renderChips({ generate });

  await userEvent.click(generateButtonOf(chips));

  await expect
    .element(generateButtonOf(chips))
    .toHaveAccessibleDescription("No se pudo generar el código interno. Probá de nuevo.");
});

test("fills the generate button on hover only while it is enabled", async () => {
  const { generate, resolveGenerate } = pendingGenerate();
  const chips = await renderChips({ generate });
  const generateButton = generateButtonOf(chips);
  const unfilled = getComputedStyle(generateButton.element()).backgroundColor;
  await userEvent.hover(generateButton);
  await expect
    .poll(() => getComputedStyle(generateButton.element()).backgroundColor)
    .not.toBe(unfilled);

  await userEvent.click(generateButton);
  await expect.element(generateButton).toBeDisabled();
  await userEvent.hover(generateButton);
  // Forces a style recalc to capture any started transition, then finishes it: a transition
  // begins at its from-value, so reading it too soon looks the same as never starting.
  getComputedStyle(generateButton.element()).backgroundColor;
  for (const animation of generateButton.element().getAnimations()) {
    animation.finish();
  }

  expect(getComputedStyle(generateButton.element()).backgroundColor).toBe(unfilled);
  resolveGenerate({ kind: "failed" });
});

test("announces a generate failure as an alert", async () => {
  const generate = vi.fn<typeof generateInternalBarcode>().mockResolvedValue({ kind: "failed" });
  const chips = await renderChips({ generate });

  await userEvent.click(generateButtonOf(chips));

  await expect
    .element(chips.getByRole("alert"))
    .toHaveTextContent("No se pudo generar el código interno. Probá de nuevo.");
});
