import {
  Button,
  formatCents,
  formatWeightInput,
  SegmentedControl,
  SidePanel,
  SummaryRowGroup,
  TextField,
} from "@purosur/ui";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import type { ReturnDraftLine } from "./return-form";
import { goesBackWhole, RETURNED_WEIGHT_DECIMALS } from "./return-form";
import { ReturnPanelFigure } from "./return-panel-figure";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import type { ReturnReasonValue } from "./return-text";
import {
  DISPOSITION_OPTIONS,
  quantityText,
  REASON_OPTIONS,
  RESOLUTION_LABELS,
} from "./return-text";

export type ReturnLinePanelProps = {
  sale: SaleForReturn;
  line: SaleLineForReturn;
  draft: ReturnDraftLine;
  refund: number | null | undefined;
  onApply: (draft: ReturnDraftLine) => void;
  onCancel: () => void;
};

const PROMOTION_REASON = "Con este motivo, la promoción se devuelve completa";

function wholeQuantityText(line: SaleLineForReturn): string {
  return line.sale_unit === "KG"
    ? formatWeightInput(line.returnable_quantity)
    : String(line.returnable_quantity);
}

export function ReturnLinePanel({
  sale,
  line,
  draft,
  refund,
  onApply,
  onCancel,
}: ReturnLinePanelProps) {
  const [edit, setEdit] = useState(draft);
  const quantityArea = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    quantityArea.current?.querySelector("input")?.focus();
  }, []);

  useKeys([
    { key: "Escape", run: onCancel },
    { key: "Enter", run: () => onApply(edit) },
  ]);

  const reason = edit.reason ?? "change_of_mind";
  const offered = sale.offered_resolutions[reason];
  const [firstResolution, ...otherResolutions] = offered.map((value) => ({
    value,
    label: RESOLUTION_LABELS[value],
  }));

  function chooseReason(next: ReturnReasonValue) {
    const nextOffered = sale.offered_resolutions[next];
    setEdit({
      ...edit,
      reason: next,
      resolution:
        edit.resolution !== null && nextOffered.includes(edit.resolution)
          ? edit.resolution
          : (nextOffered[0] ?? null),
    });
  }

  const whole = goesBackWhole(line, reason);
  const quantityLabel = "Cantidad";

  return (
    <SidePanel
      label="Editar la línea"
      width="wide"
      header={
        <ReturnPanelFigure
          label={line.product_name.toLocaleUpperCase("es-AR")}
          value={refund === undefined ? undefined : formatCents(refund ?? 0)}
        />
      }
      footer={
        <Button
          size="large"
          fullWidth
          icon={<Check />}
          iconPosition="start"
          keycap="Enter"
          onPress={() => onApply(edit)}
        >
          Aplicar
        </Button>
      }
    >
      <SummaryRowGroup
        variant="divided"
        rows={[{ label: "Vendido", value: quantityText(line.sale_unit, line.sold_quantity) }]}
      />
      <div ref={quantityArea}>
        {whole ? (
          <TextField
            kind="plain-text"
            label={quantityLabel}
            value={wholeQuantityText(line)}
            onChange={() => {}}
            readOnly
            readOnlyReason={PROMOTION_REASON}
          />
        ) : line.sale_unit === "KG" ? (
          <TextField
            kind="weight"
            suffix="kg"
            label={quantityLabel}
            decimals={RETURNED_WEIGHT_DECIMALS}
            value={edit.quantity}
            onChange={(quantity) => setEdit({ ...edit, quantity })}
          />
        ) : (
          <TextField
            kind="quantity"
            suffix="u"
            label={quantityLabel}
            inputMode="numeric"
            value={edit.quantity}
            onChange={(quantity) => setEdit({ ...edit, quantity })}
          />
        )}
      </div>
      <SegmentedControl
        variant="field"
        size="large"
        label="Motivo"
        options={REASON_OPTIONS}
        value={reason}
        onChange={chooseReason}
      />
      {firstResolution === undefined ? null : (
        <SegmentedControl
          variant="field"
          size="large"
          label="Resolución"
          options={[firstResolution, ...otherResolutions]}
          value={edit.resolution ?? firstResolution.value}
          onChange={(resolution) => setEdit({ ...edit, resolution })}
        />
      )}
      <SegmentedControl
        variant="field"
        size="large"
        label="Destino"
        options={DISPOSITION_OPTIONS}
        value={edit.disposition ?? "restock"}
        onChange={(disposition) => setEdit({ ...edit, disposition })}
      />
    </SidePanel>
  );
}
