import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ComboBox } from "../components/forms/combo-box";
import { switchBrowserLanguage } from "../test/browser-language";
import { LocaleProvider } from "./locale-provider";

function ProductField() {
  return (
    <ComboBox
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

  await expect
    .element(screen.getByRole("button", { name: "Empfehlungen anzeigen Producto" }))
    .toBeInTheDocument();
});

test("inside it, a component announces its screen-reader texts in Spanish whatever the browser's language", async () => {
  const screen = await render(
    <LocaleProvider>
      <ProductField />
    </LocaleProvider>,
  );

  switchBrowserLanguage("de-DE");

  await expect
    .element(screen.getByRole("button", { name: "Mostrar sugerencias Producto" }))
    .toBeInTheDocument();
});
