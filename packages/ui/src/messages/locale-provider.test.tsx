import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Select } from "../components/forms/select";
import { switchBrowserLanguage } from "../test/browser-language";
import { LocaleProvider } from "./locale-provider";

function ProductField() {
  return (
    <Select
      name="product"
      label="Producto"
      options={[{ value: "miel", label: "Miel de abeja" }]}
      value={null}
      onChange={() => {}}
    />
  );
}

test("outside it, a component announces its screen-reader texts in the browser's language", async () => {
  const screen = await render(<ProductField />);

  switchBrowserLanguage("de-DE");

  await expect.element(screen.getByRole("button", { name: /Element wählen/ })).toBeInTheDocument();
});

test("inside it, a component announces its screen-reader texts in Spanish whatever the browser's language", async () => {
  const screen = await render(
    <LocaleProvider>
      <ProductField />
    </LocaleProvider>,
  );

  switchBrowserLanguage("de-DE");

  await expect
    .element(screen.getByRole("button", { name: /Seleccionar un artículo/ }))
    .toBeInTheDocument();
});
