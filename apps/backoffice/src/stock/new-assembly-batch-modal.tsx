import type { RecipeSummary } from "@purosur/contracts";
import { type AssemblyBatchResult, assemblyBatchBodySchema } from "@purosur/contracts";
import {
  Button,
  EmptyState,
  FieldGroup,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  SummaryRowGroup,
  sortedItems,
  textOrder,
  useRequestForm,
} from "@purosur/ui";
import { Check, CookingPot, X } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  formatStockQuantity,
  quantityFieldKind,
  quantityMessage,
} from "../platform/stock-quantity";
import { AssemblyBatchComponentsField } from "./assembly-batch-components-field";
import {
  ASSEMBLY_BATCH_FIELDS,
  ASSEMBLY_BATCH_NO_RECIPE,
  ASSEMBLY_BATCH_NOTHING_USED,
  ASSEMBLY_BATCH_OUTPUT_REFUSED,
  ASSEMBLY_BATCH_PRODUCT_NOT_FOUND,
  ASSEMBLY_BATCH_PRODUCT_REQUIRED,
  assemblyBatchBodyOf,
  batchOutputMessage,
  batchProposalOf,
  batchSizeMessage,
  batchUsedMessage,
  EMPTY_ASSEMBLY_BATCH_FORM,
  lotPreviewRequestOf,
  outputText,
  proposalRequestOf,
} from "./assembly-batch-form";
import { AssemblyBatchNotice } from "./assembly-batch-notice";
import { AssemblyBatchOutputField } from "./assembly-batch-output-field";
import { batchLotCostText, batchLotExpiryText } from "./assembly-batch-text";
import type { fetchAssemblyBatchPreview, registerAssemblyBatch } from "./assembly-batches-api";
import {
  useAssemblyBatchLotQuery,
  useAssemblyBatchProposalQuery,
  useRefreshStock,
} from "./stock-queries";

export type NewAssemblyBatchModalServices = {
  fetchAssemblyBatchPreview: typeof fetchAssemblyBatchPreview;
  registerAssemblyBatch: typeof registerAssemblyBatch;
};

type NewAssemblyBatchModalProps = {
  recipes: readonly RecipeSummary[];
  services: NewAssemblyBatchModalServices;
  onRegistered: (batch: AssemblyBatchResult["batch"], recipe: RecipeSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

const recipeNameOrder = textOrder((recipe: RecipeSummary) => recipe.productName);
const NOT_YET = "—";

export function NewAssemblyBatchModal({
  recipes,
  services,
  onRegistered,
  onClose,
  onSessionEnded,
}: NewAssemblyBatchModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshStock = useRefreshStock();
  const [notice, setNotice] = useState<AssemblyBatchNotice | null>(null);
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [outputRefusal, setOutputRefusal] = useState<string | undefined>(undefined);
  const recipeOf = (productId: string | null) =>
    recipes.find((candidate) => candidate.productId === productId);

  const { form, values, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_ASSEMBLY_BATCH_FORM,
    request: {
      schema: assemblyBatchBodySchema,
      from: (formValues) =>
        assemblyBatchBodyOf(formValues, { recipe: recipeOf(formValues.productId), proposal }),
    },
    fields: ASSEMBLY_BATCH_FIELDS,
    messages: {
      productId: ASSEMBLY_BATCH_PRODUCT_REQUIRED,
      size: (formValues) =>
        batchSizeMessage(
          formValues.size,
          recipeOf(formValues.productId)?.saleUnit ?? "UNIT",
          proposal !== undefined,
        ),
      used: (formValues) => {
        const chosen = recipeOf(formValues.productId);
        return chosen ? batchUsedMessage(formValues, chosen, proposal) : "Revisá lo usado.";
      },
      output: (formValues) =>
        batchOutputMessage(
          outputText(formValues, recipeOf(formValues.productId)?.saleUnit ?? "UNIT", proposal),
          recipeOf(formValues.productId)?.saleUnit ?? "UNIT",
        ),
    },
    onSubmit: async (request, { values: submitted, showWireFieldError, showFieldError }) => {
      const chosen = recipeOf(submitted.productId);
      if (!chosen) {
        return;
      }
      setNotice(null);
      setRefusals({});
      setOutputRefusal(undefined);
      const outcome = await services.registerAssemblyBatch(request);
      switch (outcome.kind) {
        case "ok":
          onRegistered(outcome.batch, chosen);
          return;
        case "unauthenticated":
          onSessionEnded();
          return;
        case "forbidden":
          sendToMyAccount();
          return;
        case "product_not_found":
          showFieldError("productId", ASSEMBLY_BATCH_PRODUCT_NOT_FOUND);
          void refreshStock();
          return;
        case "no_recipe":
          showFieldError("productId", ASSEMBLY_BATCH_NO_RECIPE);
          void refreshStock();
          return;
        case "component_not_found": {
          const component = chosen.components.find(
            (candidate) => candidate.componentProductId === outcome.componentProductId,
          );
          if (component) {
            setNotice({ kind: "componentGone", name: component.name });
          } else {
            setNotice({ kind: "staleRecipe" });
          }
          void refreshStock();
          return;
        }
        case "stale_recipe":
          setNotice({ kind: "staleRecipe" });
          void refreshStock();
          return;
        case "nothing_used":
          showFieldError("used", ASSEMBLY_BATCH_NOTHING_USED);
          return;
        case "invalid_output":
          setOutputRefusal(ASSEMBLY_BATCH_OUTPUT_REFUSED);
          return;
        case "invalid_quantity": {
          const component = chosen.components.find(
            (candidate) => candidate.componentProductId === outcome.componentProductId,
          );
          setRefusals({
            [outcome.componentProductId]: quantityMessage(component?.saleUnit ?? "UNIT"),
          });
          return;
        }
        case "validation_failed":
          if (!showWireFieldError(outcome.field)) {
            setNotice({ kind: "attemptFailed" });
          }
          return;
        case "rate_limited":
          setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
          return;
        case "failed":
          setNotice({ kind: "attemptFailed" });
      }
    },
  });

  const recipe = recipeOf(values.productId);
  const proposalRequest = proposalRequestOf(values, recipe);
  const proposalRead = useAssemblyBatchProposalQuery({
    request: proposalRequest,
    fetchAssemblyBatchPreview: services.fetchAssemblyBatchPreview,
    onSessionEnded,
  });
  const sizeProposal =
    proposalRequest !== undefined && proposalRead.status === "loaded"
      ? proposalRead.value.proposal
      : undefined;
  const lotRequest = lotPreviewRequestOf(values, { recipe, proposal: sizeProposal });
  const lotRead = useAssemblyBatchLotQuery({
    request: lotRequest,
    fetchAssemblyBatchPreview: services.fetchAssemblyBatchPreview,
    onSessionEnded,
  });
  const lotPreview =
    lotRequest !== undefined && lotRead.status === "loaded" ? lotRead.value : undefined;
  const proposal = batchProposalOf(values, sizeProposal, lotPreview);

  const clearRefusals = () => {
    setRefusals({});
    setOutputRefusal(undefined);
  };
  const options = sortedItems(recipes, { order: recipeNameOrder, direction: "ascending" }).map(
    (candidate) => ({ value: candidate.productId, label: candidate.productName }),
  );
  const [firstOption, ...otherOptions] = options;
  const saleUnit = recipe?.saleUnit ?? "UNIT";
  const proposedOutput = proposal?.output;
  const lot = lotPreview?.lot ?? null;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="wide"
      tone="info"
      icon={<CookingPot />}
      context="Stock · Tandas"
      title="Nueva tanda"
      closable={!submitting}
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
            disabled={submitting || firstOption === undefined}
            onPress={() => void submit()}
          >
            Registrar la tanda
          </Button>
        </>
      }
    >
      {firstOption === undefined ? (
        <EmptyState
          icon={<CookingPot />}
          title="No hay productos armados"
          description="Creá una receta en Recetas para registrar una tanda."
          variant="blank"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {notice ? <AssemblyBatchNotice notice={notice} /> : null}
          <div className="flex flex-row items-start gap-4">
            <div className="min-w-0 flex-1">
              <form.AppField
                name="productId"
                listeners={{
                  onChange: () => {
                    form.setFieldValue("used", {});
                    form.setFieldValue("output", null);
                    clearRefusals();
                  },
                }}
              >
                {(field) => (
                  <field.ComboBox
                    label="Producto armado"
                    placeholder="Elegí un producto"
                    options={[firstOption, ...otherOptions]}
                    required
                  />
                )}
              </form.AppField>
            </div>
            <div className="w-56 shrink-0">
              <form.AppField name="size">
                {(field) => (
                  <field.TextField
                    {...(recipe ? quantityFieldKind(recipe.saleUnit) : { kind: "plain-text" })}
                    label="Tamaño de la tanda"
                    required
                  />
                )}
              </form.AppField>
            </div>
          </div>
          {recipe ? (
            <>
              <FieldGroup label="Componentes usados">
                {proposalRequest !== undefined && proposalRead.status === "failed" ? (
                  <LoadFailure {...cloudLoadFailure(proposalRead, "las cantidades de la tanda")} />
                ) : (
                  <form.AppField name="used">
                    {() => (
                      <AssemblyBatchComponentsField
                        components={recipe.components}
                        proposal={proposal}
                        refusals={refusals}
                        onUsedChange={clearRefusals}
                      />
                    )}
                  </form.AppField>
                )}
              </FieldGroup>
              <form.AppField name="output">
                {() => (
                  <AssemblyBatchOutputField
                    saleUnit={saleUnit}
                    shown={outputText(values, saleUnit, proposal)}
                    proposedText={
                      proposedOutput == null
                        ? undefined
                        : formatStockQuantity(proposedOutput, saleUnit)
                    }
                    refusal={outputRefusal}
                    onOutputChange={clearRefusals}
                  />
                )}
              </form.AppField>
              {lotRequest !== undefined && lotRead.status === "loading" ? (
                <LoadingPlaceholder variant="rows" rows={2} />
              ) : lotRequest !== undefined && lotRead.status === "failed" ? (
                <LoadFailure {...cloudLoadFailure(lotRead, "el costo del lote")} />
              ) : (
                <>
                  <SummaryRowGroup
                    variant="filled"
                    orientation="horizontal"
                    rows={[
                      {
                        label: "Costo del lote",
                        value: lot ? batchLotCostText(lot, saleUnit) : NOT_YET,
                      },
                      {
                        label: "Vencimiento",
                        value: lot ? batchLotExpiryText(lot.expiresOn) : NOT_YET,
                      },
                    ]}
                  />
                  <p className="text-detail text-text-subtle">
                    El vencimiento más próximo entre los lotes de los componentes.
                  </p>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
