import type {
  InitialCountLine,
  RecordInitialCountLineOutcome,
  WeighCountedProductOutcome,
} from "@purosur/contracts";
import {
  Button,
  Eyebrow,
  formatWeightInput,
  InlineNotice,
  SidePanel,
  SidePanelTitle,
  StatusIndicator,
  useRequestForm,
} from "@purosur/ui";
import { Check, Info, Package, Scale, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import type { ScaleWeighing, WeightReading } from "../platform/use-scale-weighing";
import { useScaleWeighing } from "../platform/use-scale-weighing";
import {
  countedMessage,
  countLineRequestFrom,
  countLineRequestSchema,
  EMPTY_COUNT_LINE_FORM,
  EXPIRY_MESSAGE,
  KG_DECIMALS,
} from "./count-line-form";
import type { CountableProduct } from "./countable-product";

type Notice = { title: string; icon: "permission" | "failure" };

const UNKNOWN_PRODUCT: Notice = { title: "Este producto ya no se puede contar.", icon: "failure" };
const NOT_PERMITTED: Notice = {
  title: "Ya no tenés permiso para cargar el inventario inicial.",
  icon: "permission",
};
const ZERO_WEIGHT_NOTE = "Poné el producto en la balanza o escribí el peso.";
const NOT_SOLD_BY_WEIGHT: Notice = {
  title: "Este producto ya no se vende por kilo.",
  icon: "failure",
};
const NOT_WEIGHED: Notice = {
  title: "No se pudo leer la balanza. Escribí el peso.",
  icon: "failure",
};
const NOT_SAVED: Notice = {
  title: "No se pudo guardar la línea. Probá de nuevo.",
  icon: "failure",
};

export type CountLinePanelProps = {
  product: CountableProduct;
  recordLine: (
    productId: string,
    counted: number,
    expiresOn: string | null,
  ) => Promise<RecordInitialCountLineOutcome>;
  weigh: (
    productId: string,
    confirmedWeightThousandths: number | null,
  ) => Promise<WeighCountedProductOutcome>;
  onRecorded: (line: InitialCountLine) => void;
  onNotOffered: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function CountLinePanel({
  product,
  recordLine,
  weigh,
  onRecorded,
  onNotOffered,
  onSessionInvalid,
  onClose,
}: CountLinePanelProps) {
  const { product_id: productId, sale_unit: saleUnit } = product;
  const [notice, setNotice] = useState<Notice>();
  const [weighingRefusal, setWeighingRefusal] = useState<{ notice: Notice; dismissed: boolean }>();

  function refuseWeighing(refusal: Notice): ScaleWeighing<WeightReading> {
    setWeighingRefusal({ notice: refusal, dismissed: false });
    return { kind: "scale_unavailable" };
  }

  const { phase, confirming, zeroRefused, confirm, typeInstead } = useScaleWeighing<WeightReading>(
    async (confirmedWeightThousandths) => {
      if (saleUnit !== "KG") {
        return { kind: "closed" };
      }
      const outcome = await weigh(productId, confirmedWeightThousandths).catch(
        (): WeighCountedProductOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "not_offered":
          onNotOffered();
          return { kind: "closed" };
        case "not_signed_in":
          onSessionInvalid();
          return { kind: "closed" };
        case "not_permitted":
          return refuseWeighing(NOT_PERMITTED);
        case "unknown_product":
          return refuseWeighing(UNKNOWN_PRODUCT);
        case "not_sold_by_weight":
          return refuseWeighing(NOT_SOLD_BY_WEIGHT);
        case "unavailable":
          return refuseWeighing(NOT_WEIGHED);
        case "weighed":
          return { kind: "stable", reading: { weightThousandths: outcome.weight_thousandths } };
        case "confirmed":
          return { kind: "taken", reading: { weightThousandths: outcome.weight_thousandths } };
        case "unsteady":
          return { kind: "unsteady", reading: { weightThousandths: outcome.weight_thousandths } };
        case "zero_weight":
        case "weighing":
        case "unsteady_out_of_range":
        case "scale_unavailable":
          return { kind: outcome.kind };
      }
    },
  );

  function clearNotices() {
    setNotice(undefined);
    setWeighingRefusal((current) => current && { ...current, dismissed: true });
  }

  const { form, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_COUNT_LINE_FORM,
    request: { schema: countLineRequestSchema, from: countLineRequestFrom(saleUnit) },
    fields: { counted: "counted", expires_on: "expiresOn" },
    messages: {
      counted: (values) => countedMessage(saleUnit, values),
      expiresOn: EXPIRY_MESSAGE,
    },
    onSubmit: async ({ counted, expires_on }, { values, showFieldError }) => {
      const outcome = await recordLine(productId, counted, expires_on).catch(
        (): RecordInitialCountLineOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "recorded":
          onRecorded(outcome.line);
          break;
        case "invalid_quantity":
          showFieldError("counted", countedMessage(saleUnit, values));
          break;
        case "invalid_expiry":
          showFieldError("expiresOn", EXPIRY_MESSAGE);
          break;
        case "unknown_product":
          setNotice(UNKNOWN_PRODUCT);
          break;
        case "not_permitted":
          setNotice(NOT_PERMITTED);
          break;
        case "not_offered":
          onNotOffered();
          break;
        case "not_signed_in":
          onSessionInvalid();
          break;
        case "unavailable":
          setNotice(NOT_SAVED);
          break;
      }
    },
  });

  const panel = useRef<HTMLFormElement>(null);
  const counted = useRef<HTMLDivElement>(null);
  const latestSubmit = useRef(submit);
  const weightInField = useRef<"none" | "stable" | "unsteady">("none");

  useEffect(() => {
    latestSubmit.current = submit;
  });

  useEffect(() => {
    function fillCounted(counted: string) {
      form.setFieldValue("counted", counted, { dontRunListeners: true });
    }
    switch (phase.kind) {
      case "weighing":
        if (phase.last !== undefined) {
          fillCounted(formatWeightInput(phase.last.weightThousandths));
          weightInField.current = "stable";
        } else if (weightInField.current !== "none") {
          fillCounted("");
          weightInField.current = "none";
        }
        break;
      case "unsteady":
      case "stable":
        fillCounted(formatWeightInput(phase.reading.weightThousandths));
        weightInField.current = phase.kind;
        break;
      case "scale_unavailable":
        if (weightInField.current === "unsteady") {
          fillCounted("");
          weightInField.current = "none";
        }
        break;
      case "taken":
        fillCounted(formatWeightInput(phase.reading.weightThousandths));
        void latestSubmit.current();
        break;
      case "typing":
        break;
    }
  }, [phase, form]);

  const byWeight = saleUnit === "KG";
  const followingScale =
    byWeight && (phase.kind === "weighing" || phase.kind === "unsteady" || phase.kind === "stable");
  const scaleUnavailable = byWeight && phase.kind === "scale_unavailable";
  const shownNotice =
    notice ??
    (scaleUnavailable && weighingRefusal !== undefined && !weighingRefusal.dismissed
      ? weighingRefusal.notice
      : undefined);

  function requestSubmit() {
    if (submitting || confirming) {
      return;
    }
    clearNotices();
    if (followingScale) {
      confirm();
      return;
    }
    void submit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestSubmit();
  }

  function cancel() {
    if (!submitting) {
      onClose();
    }
  }

  function writeWeight() {
    typeInstead();
    const input = counted.current?.querySelector("input");
    input?.focus();
    input?.select();
  }

  useEffect(() => {
    counted.current?.querySelector("input")?.focus();
  }, []);

  useKeys([
    { key: "Escape", run: cancel },
    { key: "F5", run: writeWeight, enabled: followingScale },
  ]);
  useKeys([{ key: "Enter", run: requestSubmit }], { within: panel });

  return (
    <form ref={panel} className="contents" noValidate onSubmit={handleSubmit}>
      <SidePanel
        width="wide"
        label={product.name}
        header={
          <SidePanelTitle
            icon={byWeight ? <Scale /> : <Package />}
            title={product.name}
            onClose={cancel}
            closeLabel="Cancelar"
            closeDisabled={submitting}
          />
        }
        footer={
          <Button
            type="submit"
            size="large"
            fullWidth
            icon={<Check />}
            iconPosition="start"
            keycap="Enter"
            dataStatus={submitting || confirming ? "loading" : "loaded"}
          >
            Confirmar línea
          </Button>
        }
      >
        <Eyebrow text={byWeight ? "Producto por peso" : "Producto por unidad"} />
        {followingScale ? (
          <div className="flex items-center justify-between gap-4">
            <Eyebrow text="Balanza" />
            {phase.kind === "stable" ? (
              <StatusIndicator tone="success">Lectura estable</StatusIndicator>
            ) : (
              <StatusIndicator tone="info" busy>
                Pesando…
              </StatusIndicator>
            )}
          </div>
        ) : null}
        {followingScale && zeroRefused ? (
          <InlineNotice tone="info" icon={<Info />} description={ZERO_WEIGHT_NOTE} />
        ) : null}
        {scaleUnavailable && weighingRefusal === undefined ? (
          <InlineNotice
            tone="info"
            icon={<Info />}
            description="La balanza no está disponible. Escribí el peso."
          />
        ) : null}
        <div ref={counted} className="flex flex-col gap-3">
          <form.AppField
            name="counted"
            listeners={{
              onChange: () => {
                typeInstead();
                clearNotices();
              },
            }}
          >
            {(countedField) =>
              byWeight ? (
                <countedField.TextField
                  kind="weight"
                  suffix="kg"
                  label="Cantidad contada"
                  decimals={KG_DECIMALS}
                  disabled={submitting}
                />
              ) : (
                <countedField.TextField
                  kind="quantity"
                  suffix="u"
                  label="Cantidad contada"
                  inputMode="numeric"
                  labelKeycap="Digits"
                  disabled={submitting}
                />
              )
            }
          </form.AppField>
          {followingScale ? (
            <Button variant="text" keycap="F5" onPress={writeWeight}>
              Escribir peso
            </Button>
          ) : null}
        </div>
        <form.AppField name="expiresOn" listeners={{ onChange: clearNotices }}>
          {(expiresOn) => (
            <expiresOn.DateField
              label="Vencimiento"
              placeholder="Sin vencimiento"
              disabled={submitting}
            />
          )}
        </form.AppField>
        {shownNotice === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={shownNotice.icon === "permission" ? <UserX /> : <TriangleAlert />}
            title={shownNotice.title}
          />
        )}
      </SidePanel>
    </form>
  );
}
