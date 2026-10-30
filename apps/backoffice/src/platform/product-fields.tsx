import type { BrandSummary, TagSummary } from "@purosur/contracts";
import { FieldGroup, type Option, withFieldGroup } from "@purosur/ui";
import type { ReactNode } from "react";
import { BarcodeChips } from "./barcode-chips";
import type { CreatableChoice } from "./creatable-options";
import { brandFieldHelp, brandOptions, withCreatedBrand } from "./product-brand-field";
import { EMPTY_PRODUCT_FORM, NET_CONTENT_UNIT_OPTIONS } from "./product-form";
import { type StackedTagCreation, TagsField, withCreatedTags } from "./product-tags-field";
import { SALE_UNIT_OPTIONS } from "./sale-unit-options";
import type { StackedCreation } from "./stacked-creation";

type Choices<Item, Creation> =
  | { state: "loaded"; items: Item[]; creation: Creation | null }
  | { state: "unavailable"; placeholder: ReactNode };

export const PRODUCT_GROUP_FIELDS = {
  name: "name",
  categoryId: "categoryId",
  brandId: "brandId",
  saleUnit: "saleUnit",
  netContent: "netContent",
  barcodes: "barcodes",
  tagIds: "tagIds",
} as const;

function creationEntry(
  recordKind: string,
  creation: { start: (typedName: string) => void } | null,
): { creation?: { recordKind: string; onCreate: (typedText: string) => void } } {
  return creation === null ? {} : { creation: { recordKind, onCreate: creation.start } };
}

type ProductFieldsProps = {
  categories:
    | { state: "loaded"; choice: CreatableChoice<Option<string>> }
    | { state: "unavailable"; placeholder: ReactNode };
  brands: Choices<BrandSummary, StackedCreation<BrandSummary>>;
  tags: Choices<TagSummary, StackedTagCreation>;
  chips: Parameters<typeof BarcodeChips>[0]["chips"];
  generation: NonNullable<Parameters<typeof BarcodeChips>[0]["generation"]>;
  disabled: boolean;
};

export const ProductFields = withFieldGroup({
  defaultValues: EMPTY_PRODUCT_FORM,
  props: {} as ProductFieldsProps,
  render: function Render({ group, categories, brands, tags, chips, generation, disabled }) {
    return (
      <>
        <group.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
        </group.AppField>
        {categories.state === "unavailable" ? (
          categories.placeholder
        ) : (
          <group.AppField name="categoryId">
            {(field) => (
              <field.ComboBox
                label="Categoría"
                placeholder="Elegí una categoría"
                required
                {...categories.choice}
              />
            )}
          </group.AppField>
        )}
        {brands.state === "unavailable" ? (
          brands.placeholder
        ) : (
          <group.AppField name="brandId">
            {(field) => {
              const offered = withCreatedBrand(brands.items, brands.creation?.created ?? null);
              return (
                <field.ComboBox
                  label="Marca"
                  options={brandOptions(offered, null)}
                  {...brandFieldHelp(offered, field.state.value)}
                  {...creationEntry("marca", brands.creation)}
                />
              );
            }}
          </group.AppField>
        )}
        <group.AppField name="netContent">
          {(field) => (
            <field.QuantityUnitField
              label="Contenido neto"
              options={NET_CONTENT_UNIT_OPTIONS}
              unitLabel="Unidad"
            />
          )}
        </group.AppField>
        {tags.state === "unavailable" ? (
          tags.placeholder
        ) : (
          <group.AppField name="tagIds">
            {() => (
              <TagsField
                tags={withCreatedTags(tags.items, tags.creation?.created ?? [])}
                onCreateTag={tags.creation?.start}
                disabled={disabled}
              />
            )}
          </group.AppField>
        )}
        <FieldGroup label="Unidad de venta" required>
          <group.AppField name="saleUnit">
            {(field) => (
              <field.OptionCardGroup label="Unidad de venta" options={SALE_UNIT_OPTIONS} required />
            )}
          </group.AppField>
        </FieldGroup>
        <group.AppField name="barcodes">
          {() => <BarcodeChips chips={chips} generation={generation} />}
        </group.AppField>
      </>
    );
  },
});
