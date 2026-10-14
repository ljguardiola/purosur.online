import type { RecipeSummary } from "@purosur/contracts";
import {
  dataColumn,
  SharedFieldError,
  Table,
  TableCellText,
  TextField,
  useFieldContext,
  useTableModel,
} from "@purosur/ui";
import { formatStockQuantity, quantityFieldKind } from "../platform/stock-quantity";
import { type AssemblyBatchProposal, usedText } from "./assembly-batch-form";

type RecipeComponent = RecipeSummary["components"][number];

type AssemblyBatchComponentsFieldProps = {
  components: readonly RecipeComponent[];
  proposal: AssemblyBatchProposal | undefined;
  refusals: Readonly<Record<string, string>>;
  onUsedChange: () => void;
};

type UsedTableProps = AssemblyBatchComponentsFieldProps & {
  typed: Readonly<Record<string, string>>;
  errorMessageId: string | undefined;
  onTyped: (typed: Record<string, string>) => void;
};

function UsedTable({
  components,
  proposal,
  refusals,
  onUsedChange,
  typed,
  errorMessageId,
  onTyped,
}: UsedTableProps) {
  const columns = [
    dataColumn({
      id: "component",
      header: "Componente",
      render: (component: RecipeComponent) => (
        <TableCellText strong>{component.name}</TableCellText>
      ),
    }),
    dataColumn({
      id: "recipe",
      header: "Receta",
      align: "end",
      render: (component: RecipeComponent) => {
        const proposed = proposal?.used.find(
          (use) => use.componentProductId === component.componentProductId,
        )?.quantity;
        return (
          <TableCellText tone="subtle">
            {proposed === undefined ? "—" : formatStockQuantity(proposed, component.saleUnit)}
          </TableCellText>
        );
      },
    }),
    dataColumn({
      id: "used",
      header: "Usado",
      align: "end",
      width: 190,
      render: (component: RecipeComponent) => {
        const refusal = refusals[component.componentProductId];
        const shown =
          refusal !== undefined
            ? { errorMessage: refusal }
            : errorMessageId !== undefined
              ? { errorMessageId }
              : {};
        return (
          <TextField
            {...quantityFieldKind(component.saleUnit)}
            label={`Usado de ${component.name}`}
            labelVisuallyHidden
            value={usedText({ used: typed }, component, proposal)}
            onChange={(value) => {
              onUsedChange();
              onTyped({ ...typed, [component.componentProductId]: value });
            }}
            {...shown}
          />
        );
      },
    }),
  ] as const;

  const table = useTableModel({
    items: components,
    id: (component) => component.componentProductId,
    columns,
  });

  return <Table aria-label="Componentes usados" table={table} variant="nested" />;
}

export function AssemblyBatchComponentsField(props: AssemblyBatchComponentsFieldProps) {
  const field = useFieldContext<Record<string, string>>();
  return (
    <SharedFieldError>
      {(errorMessageId) => (
        <UsedTable
          {...props}
          typed={field.state.value}
          errorMessageId={errorMessageId}
          onTyped={field.handleChange}
        />
      )}
    </SharedFieldError>
  );
}
