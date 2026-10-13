import type { RecipeList, RecipeSummary } from "@purosur/contracts";
import { recipeSaveBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { RecipeComponentsField } from "./recipe-components-field";
import {
  EMPTY_RECIPE_FORM,
  RECIPE_FIELDS,
  RECIPE_NO_COMPONENTS,
  recipeComponentsHeading,
  recipeComponentsMessage,
  recipeFormValuesOf,
  recipeRowRefusalOf,
  recipeSaveRequestFrom,
} from "./recipe-form";
import { RecipeSaveNotice } from "./recipe-save-notice";
import type { saveRecipe } from "./recipes-api";
import { useRefreshStock } from "./stock-queries";

export type EditRecipeModalServices = {
  saveRecipe: typeof saveRecipe;
};

type EditRecipeModalProps = {
  target: RecipeSummary | null;
  products: RecipeList["products"];
  services: EditRecipeModalServices;
  onSaved: (recipe: RecipeSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function EditRecipeModal({
  target,
  products,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: EditRecipeModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshStock = useRefreshStock();
  const [notice, setNotice] = useState<RecipeSaveNotice | null>(null);
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<RecipeSummary | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_RECIPE_FORM,
    request: { schema: recipeSaveBodySchema, from: recipeSaveRequestFrom },
    fields: RECIPE_FIELDS,
    messages: { components: recipeComponentsMessage },
    onSubmit: async (request, { values: submitted, showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      setRefusals({});
      const outcome = await services.saveRecipe(target.productId, request);
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
        setNotice({ kind: "productNotFound" });
        void refreshStock();
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        void refreshStock();
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
    if (target) {
      reset(recipeFormValuesOf(target));
      setShown(target);
      setNotice(null);
      setRefusals({});
    }
  }, [target, reset]);

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Pencil />}
      context="Stock · Recetas"
      title={(target ?? shown)?.productName ?? ""}
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
            disabled={submitting}
            onPress={() => void submit()}
          >
            Guardar la receta
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          {notice ? <RecipeSaveNotice notice={notice} /> : null}
          <h3 className="font-bold text-body text-text">
            {recipeComponentsHeading(target.saleUnit)}
          </h3>
          <form.AppField name="components">
            {() => (
              <RecipeComponentsField
                products={products}
                assembledProductId={target.productId}
                refusals={refusals}
                onComponentsChange={() => setRefusals({})}
              />
            )}
          </form.AppField>
          <p className="text-detail text-text-subtle">
            Es una plantilla: al registrar una tanda se proponen estas cantidades y se registra lo
            que realmente se usó.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
