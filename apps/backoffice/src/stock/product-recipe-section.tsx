import type { AssemblyBatch, RecipeSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  EmptyState,
  Eyebrow,
  LoadFailure,
  LoadingPlaceholder,
  SummaryRowGroup,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Ban, CookingPot, Plus } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { ProductRecipeSectionProps as PanelProps } from "../platform/product-panel-sections";
import { formatStockQuantity } from "../platform/stock-quantity";
import {
  BATCH_COST_INCOMPLETE,
  BATCH_WITHOUT_EXPIRY,
  batchExpiryText,
  batchUnitCostText,
} from "./assembly-batch-text";
import {
  type AssemblyBatchesScreenServices,
  defaultAssemblyBatchesScreenServices,
} from "./assembly-batches-services";
import { NewAssemblyBatchModal } from "./new-assembly-batch-modal";
import { fetchRecipes } from "./recipes-api";
import { formatStockDay, formatStockTime } from "./stock-period";
import { useAssemblyBatchesQuery, useRecipesQuery, useRefreshStock } from "./stock-queries";
import { VoidAssemblyBatchModal } from "./void-assembly-batch-modal";

export type ProductRecipeSectionServices = AssemblyBatchesScreenServices & {
  fetchRecipes: typeof fetchRecipes;
};

export type ProductRecipeSectionProps = PanelProps & {
  services?: ProductRecipeSectionServices | undefined;
};

const BATCHES_PERIOD_DAYS = 90;

const defaultServices: ProductRecipeSectionServices = {
  ...defaultAssemblyBatchesScreenServices,
  fetchRecipes,
};

export function ProductRecipeSection({
  productId,
  mayManageBatches,
  onSessionEnded,
  services = defaultServices,
}: ProductRecipeSectionProps) {
  const recipes = useRecipesQuery({ fetchRecipes: services.fetchRecipes, onSessionEnded });
  const batches = useAssemblyBatchesQuery({
    enabled: mayManageBatches,
    days: BATCHES_PERIOD_DAYS,
    fetchAssemblyBatches: services.fetchAssemblyBatches,
    onSessionEnded,
  });
  const refreshStock = useRefreshStock();
  const [registering, setRegistering] = useState(false);
  const [voiding, setVoiding] = useState<AssemblyBatch | null>(null);

  const columns = [
    dataColumn({
      id: "date",
      header: "Fecha",
      render: (batch: AssemblyBatch) => (
        <div className="flex items-center gap-2">
          <TableCellText strong description={formatStockTime(batch.assembledAt)}>
            {formatStockDay(batch.assembledAt)}
          </TableCellText>
          {batch.status === "voided" ? <Tag tone="neutral">Anulada</Tag> : null}
        </div>
      ),
    }),
    dataColumn({
      id: "output",
      header: "Obtenido",
      align: "end",
      render: (batch: AssemblyBatch) => (
        <TableCellText>{formatStockQuantity(batch.output, batch.saleUnit)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "unitCost",
      header: "Costo unitario",
      align: "end",
      render: (batch: AssemblyBatch) => {
        const cost = batchUnitCostText(batch, batch.saleUnit);
        return cost === null ? (
          <TableCellText tone="subtle">{BATCH_COST_INCOMPLETE}</TableCellText>
        ) : (
          <TableCellText>{cost}</TableCellText>
        );
      },
    }),
    dataColumn({
      id: "expiresOn",
      header: "Vence",
      render: (batch: AssemblyBatch) => (
        <TableCellText tone={batch.expiresOn === null ? "subtle" : undefined}>
          {batch.expiresOn === null ? BATCH_WITHOUT_EXPIRY : batchExpiryText(batch.expiresOn)}
        </TableCellText>
      ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones de la tanda",
      actions: [
        (batch: AssemblyBatch) =>
          batch.status === "voidable"
            ? {
                icon: <Ban />,
                "aria-label": `Anular tanda de ${formatProductDescription({ name: batch.productName, brandName: batch.brandName, netContent: batch.netContent })}`,
                onPress: () => setVoiding(batch),
              }
            : undefined,
      ],
    }),
  ] as const;
  const table = useTableModel({
    items: batches.status === "loaded" ? batches.value.batches : [],
    id: (batch) => batch.id,
    filter: (batch) => batch.productId === productId,
    columns,
  });

  if (recipes.status === "loading" || (mayManageBatches && batches.status === "loading")) {
    return <LoadingPlaceholder variant="rows" rows={3} />;
  }
  if (recipes.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(recipes, "la receta")} />;
  }
  if (mayManageBatches && batches.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(batches, "las tandas")} />;
  }
  const recipe: RecipeSummary | undefined = recipes.value.recipes.find(
    (candidate) => candidate.productId === productId,
  );
  if (recipe === undefined) {
    return (
      <EmptyState
        icon={<CookingPot />}
        title="Sin receta"
        description="Este producto no se arma con una receta."
        variant="blank"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-col gap-2">
        <Eyebrow text="Receta" />
        <SummaryRowGroup
          variant="filled"
          rows={
            [
              ...recipe.components.map((component) => ({
                label: formatProductDescription(component),
                value: formatStockQuantity(component.quantityPerOutputUnit, component.saleUnit),
              })),
            ] as [{ label: string; value: string }, ...{ label: string; value: string }[]]
          }
        />
      </div>
      {mayManageBatches ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow text="Tandas de los últimos 90 días" />
            <Button
              variant="secondary"
              size="small"
              icon={<Plus />}
              onPress={() => setRegistering(true)}
            >
              Registrar tanda
            </Button>
          </div>
          <Table
            aria-label="Tandas"
            table={table}
            variant="nested"
            empty={{
              icon: <CookingPot />,
              title: "Sin tandas en los últimos 90 días",
              description: "Cada tanda registra lo que se usó y lo que se obtuvo.",
              variant: "blank",
            }}
          />
        </div>
      ) : null}
      {registering ? (
        <NewAssemblyBatchModal
          recipes={[recipe]}
          services={services}
          onRegistered={() => {
            setRegistering(false);
            void refreshStock();
          }}
          onClose={() => setRegistering(false)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
      {voiding ? (
        <VoidAssemblyBatchModal
          batch={voiding}
          services={services}
          onVoided={() => {
            setVoiding(null);
            void refreshStock();
          }}
          onOutdated={() => {
            setVoiding(null);
            void refreshStock();
          }}
          onClose={() => setVoiding(null)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
    </div>
  );
}
