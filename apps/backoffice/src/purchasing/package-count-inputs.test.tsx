import { FieldSizeProvider } from "@purosur/ui";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PackageCountInputs } from "./package-count-inputs";

async function renderInside(width: number) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main style={{ width: `${width}px` }}>
        <PackageCountInputs
          saleUnit="UNIT"
          packages="3"
          quantityPerPackage="12"
          onPackagesChange={() => {}}
          onQuantityPerPackageChange={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
  const packages = screen
    .getByRole("textbox", { name: /^Cantidad de paquetes/ })
    .element()
    .getBoundingClientRect();
  const perPackage = screen
    .getByRole("textbox", { name: /^Cantidad por paquete/ })
    .element()
    .getBoundingClientRect();
  return { packages, perPackage };
}

test("stacks the quantity each package holds under the packages in a container too narrow for both", async () => {
  const { packages, perPackage } = await renderInside(260);

  expect(perPackage.top).toBeGreaterThanOrEqual(packages.bottom);
});

test("sets the packages and the quantity each package holds side by side where both fit", async () => {
  const { packages, perPackage } = await renderInside(600);

  expect(perPackage.top).toBe(packages.top);
  expect(perPackage.left).toBeGreaterThanOrEqual(packages.right);
});
