import type { ReturnDraftLineBody } from "@purosur/contracts";
import {
  Button,
  formatCents,
  formatWeightInput,
  SidePanel,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { useKeys } from "../platform/key-layer";
import type { ReturnDraftLine } from "./return-form";
import { goesBackWhole, RETURNED_WEIGHT_DECIMALS } from "./return-form";
import type { ReturnLineFormValues } from "./return-line-form";
import {
  RETURN_LINE_FIELDS,
  resolutionForReason,
  returnLineFormValuesOf,
  returnLineRequestFrom,
  returnLineRequestSchema,
} from "./return-line-form";
import { ReturnPanelFigure } from "./return-panel-figure";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import { DISPOSITION_OPTIONS, quantityText, RESOLUTION_LABELS, reasonOptions } from "./return-text";

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
  const quantityArea = useRef<HTMLDivElement | null>(null);
  const { form, submit, values } = useRequestForm<
    ReturnLineFormValues,
    ReturnDraftLineBody,
    ReturnDraftLineBody,
    never
  >({
    defaultValues: returnLineFormValuesOf(sale, draft),
    request: {
      schema: returnLineRequestSchema,
      from: (edited) => returnLineRequestFrom(line, edited),
    },
    fields: RETURN_LINE_FIELDS,
    messages: {},
    onSubmit: async (_request, { values: edited }) => onApply(edited),
  });

  useEffect(() => {
    quantityArea.current?.querySelector("input")?.focus();
  }, []);

  useKeys([
    { key: "Escape", run: onCancel },
    { key: "Enter", run: () => void submit() },
  ]);

  const [firstResolution, ...otherResolutions] = sale.offered_resolutions[values.reason].map(
    (value) => ({ value, label: RESOLUTION_LABELS[value] }),
  );

  const whole = goesBackWhole(line, values.reason);
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
          onPress={() => void submit()}
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
        ) : (
          <form.AppField name="quantity">
            {(field) =>
              line.sale_unit === "KG" ? (
                <field.TextField
                  kind="weight"
                  suffix="kg"
                  label={quantityLabel}
                  decimals={RETURNED_WEIGHT_DECIMALS}
                />
              ) : (
                <field.TextField
                  kind="quantity"
                  suffix="u"
                  label={quantityLabel}
                  inputMode="numeric"
                />
              )
            }
          </form.AppField>
        )}
      </div>
      <form.AppField
        name="reason"
        listeners={{
          onChange: ({ value }) =>
            form.setFieldValue(
              "resolution",
              resolutionForReason(sale, value, form.getFieldValue("resolution")),
            ),
        }}
      >
        {(field) => (
          <field.SegmentedControl
            variant="field"
            size="large"
            label="Motivo"
            options={reasonOptions(sale.windows)}
          />
        )}
      </form.AppField>
      {firstResolution === undefined ? null : (
        <form.AppField name="resolution">
          {(field) => (
            <field.SegmentedControl
              variant="field"
              size="large"
              label="Resolución"
              options={[firstResolution, ...otherResolutions]}
            />
          )}
        </form.AppField>
      )}
      <form.AppField name="disposition">
        {(field) => (
          <field.SegmentedControl
            variant="field"
            size="large"
            label="Destino"
            options={DISPOSITION_OPTIONS}
          />
        )}
      </form.AppField>
    </SidePanel>
  );
}
