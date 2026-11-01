import { FieldSizeProvider } from "@purosur/ui";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { NewProductModal, type NewProductModalServices } from "../new-product-modal";
import { driedFruits, groceries } from "./products";

export function createServices(
  overrides: Partial<NewProductModalServices> = {},
): NewProductModalServices {
  return {
    createProduct: vi.fn(),
    createBrand: vi.fn(),
    createCategory: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
    ...overrides,
  };
}

export type NewProductModalProps = Partial<
  Omit<ComponentProps<typeof NewProductModal>, "services">
>;

export function newProductModalElement(
  services: NewProductModalServices,
  props: NewProductModalProps = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <NewProductModal
          open
          onClose={() => {}}
          onCreated={() => {}}
          onSessionEnded={() => {}}
          categories={[groceries, driedFruits]}
          brands={[]}
          tags={[]}
          {...props}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderNewProductModal(
  services: NewProductModalServices,
  props: NewProductModalProps = {},
) {
  return render(newProductModalElement(services, props));
}
