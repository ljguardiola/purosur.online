import type { RecipeList, RecipeSummary } from "@purosur/contracts";
import { recipeSaveBodySchema } from "@purosur/contracts";
import { Button, EmptyState, Modal, useRequestForm } from "@purosur/ui";
import { BookOpen, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { RecipeComponentsField } from "./recipe-components-field";
import {
  EMPTY_RECIPE_FORM,
  RECIPE_FIELDS,
  RECIPE_NO_COMPONENTS,
  RECIPE_PRODUCT_NOT_FOUND,
  RECIPE_PRODUCT_REQUIRED,
  recipeComponentsHeading,
  recipeComponentsMessage,
  recipeProductOptions,
  recipeRowRefusalOf,
  recipeSaveRequestFrom,
} from "./recipe-form";
import { RecipeSaveNotice } from "./recipe-save-notice";
import type { saveRecipe } from "./recipes-api";
import { useRefreshStock } from "./stock-queries";

export type NewRecipeModalServices = {
  saveRecipe: typeof saveRecipe;
};

type NewRecipeModalProps = {
  open: boolean;
  products: RecipeList["products"];
  recipes: readonly RecipeSummary[];
  services: NewRecipeModalServices;
  onSaved: (recipe: RecipeSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function NewRecipeModal({
  open,
  products,
  recipes,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: NewRecipeModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshStock = useRefreshStock();
  const [notice, setNotice] = useState<RecipeSaveNotice | null>(null);
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const { form, values, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_RECIPE_FORM,
    request: { schema: recipeSaveBodySchema, from: recipeSaveRequestFrom },
    fields: RECIPE_FIELDS,
    messages: { components: recipeComponentsMessage },
    onSubmit: async (request, { values: submitted, showWireFieldError, showFieldError }) => {
      setNotice(null);
      setRefusals({});
      if (submitted.productId === null) {
        showFieldError("productId", RECIPE_PRODUCT_REQUIRED);
        return;
      }
      const outcome = await services.saveRecipe(submitted.productId, request);
      if (outcome.kind === "ok") {
        onSaved(outcome.recipe);
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "product_not_found") {
        showFieldError("productId", RECIPE_PRODUCT_NOT_FOUND);
        void refreshStock();
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "component_not_found" || outcome.kind === "invalid_recipe") {
        const refusal = recipeRowRefusalOf(outcome, submitted);
        if (refusal) {
          setRefusals({ [refusal.productId]: refusal.message });
        } else {
          showFieldError("components", RECIPE_NO_COMPONENTS);
        }
        if (outcome.kind === "component_not_found") {
          void refreshStock();
        }
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (open) {
      reset();
      setNotice(null);
      setRefusals({});
    }
  }, [open, reset]);

  const options = recipeProductOptions(products, recipes);
  const assembledUnit = products.find((product) => product.id === values.productId)?.saleUnit;

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<BookOpen />}
      context="Stock · Recetas"
      title="Nueva receta"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting || !options}
            onPress={() => void submit()}
          >
            Crear la receta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice ? <RecipeSaveNotice notice={notice} /> : null}
        {options ? (
          <>
            <form.AppField name="productId">
              {(field) => (
                <field.ComboBox
                  label="Producto armado"
                  placeholder="Elegí un producto"
                  options={options}
                  required
                />
              )}
            </form.AppField>
            <h3 className="font-bold text-body text-text">
              {recipeComponentsHeading(assembledUnit ?? null)}
            </h3>
            <form.AppField name="components">
              {() => (
                <RecipeComponentsField
                  products={products}
                  assembledProductId={values.productId}
                  refusals={refusals}
                  onComponentsChange={() => setRefusals({})}
                />
              )}
            </form.AppField>
            <p className="text-detail text-text-subtle">
              Es una plantilla: al registrar una tanda se proponen estas cantidades y se registra lo
              que realmente se usó.
            </p>
          </>
        ) : (
          <EmptyState
            icon={<BookOpen />}
            title="No hay productos para armar"
            description="Todos los productos activos ya tienen una receta."
            variant="blank"
          />
        )}
      </div>
    </Modal>
  );
}
