import type {
  InitialCountLine,
  RecordInitialCountLineOutcome,
  WeighCountedProductOutcome,
} from "@purosur/contracts";
import { Button, formatWeightInput, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, Info, Package, Scale, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { ScaleWeighing, StableReading } from "../platform/use-scale-weighing";
import { useScaleWeighing } from "../platform/use-scale-weighing";
import {
  countedMessage,
  countLineRequestFrom,
  countLineRequestSchema,
  EMPTY_COUNT_LINE_FORM,
  EXPIRY_MESSAGE,
} from "./count-line-form";
import type { CountableProduct } from "./countable-product";

type Notice = { title: string; icon: "permission" | "failure" };

const UNKNOWN_PRODUCT: Notice = { title: "Este producto ya no se puede contar.", icon: "failure" };
const NOT_PERMITTED: Notice = {
  title: "Ya no tenés permiso para cargar el inventario inicial.",
  icon: "permission",
};
const NOT_SAVED: Notice = {
  title: "No se pudo guardar la línea. Probá de nuevo.",
  icon: "failure",
};

export type CountLineModalProps = {
  product: CountableProduct;
  recordLine: (
    productId: string,
    counted: number,
    expiresOn: string | null,
  ) => Promise<RecordInitialCountLineOutcome>;
  weigh: (productId: string) => Promise<WeighCountedProductOutcome>;
  onRecorded: (line: InitialCountLine) => void;
  onNotOffered: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function CountLineModal({
  product,
  recordLine,
  weigh,
  onRecorded,
  onNotOffered,
  onSessionInvalid,
  onClose,
}: CountLineModalProps) {
  const { product_id: productId, sale_unit: saleUnit } = product;
  const [notice, setNotice] = useState<Notice>();

  const { phase, typeInstead } = useScaleWeighing<StableReading>(async () => {
    if (saleUnit !== "KG") {
      return { kind: "closed" };
    }
    const reading = await weigh(productId).catch(
      (): WeighCountedProductOutcome => ({ kind: "unavailable" }),
    );
    return scaleWeighingOf(reading);
  });

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

  useEffect(() => {
    if (phase.kind === "taken") {
      form.setFieldValue("counted", formatWeightInput(phase.weightThousandths));
    }
  }, [phase, form]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  const byWeight = saleUnit === "KG";

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={byWeight ? <Scale /> : <Package />}
      context={byWeight ? "Producto por peso" : "Producto por unidad"}
      title={product.name}
      closable={!submitting}
      footer={
        <>
          <Button variant="secondary" size="large" disabled={submitting} onPress={onClose}>
            Cancelar
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={() => void submit()}
          >
            Confirmar línea
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
        {byWeight && phase.kind === "scale_unavailable" ? (
          <InlineNotice
            tone="info"
            icon={<Info />}
            description="La balanza no está disponible. Escribí el peso."
          />
        ) : null}
        <form.AppField
          name="counted"
          listeners={{
            onChange: () => {
              typeInstead();
              setNotice(undefined);
            },
          }}
        >
          {(counted) =>
            byWeight ? (
              <counted.TextField
                kind="weight"
                suffix="kg"
                label="Cantidad contada"
                inputMode="numeric"
                description="Podés pesarlo en la balanza o escribir el peso."
                disabled={submitting}
              />
            ) : (
              <counted.TextField
                kind="quantity"
                suffix="u"
                label="Cantidad contada"
                inputMode="numeric"
                disabled={submitting}
              />
            )
          }
        </form.AppField>
        <form.AppField name="expiresOn" listeners={{ onChange: () => setNotice(undefined) }}>
          {(expiresOn) => (
            <expiresOn.DateField
              label="Vencimiento"
              description="Si el mismo producto tiene otro vencimiento, se carga como una línea aparte."
              disabled={submitting}
            />
          )}
        </form.AppField>
        {notice === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={notice.icon === "permission" ? <UserX /> : <TriangleAlert />}
            title={notice.title}
          />
        )}
      </form>
    </Modal>
  );
}

function scaleWeighingOf(outcome: WeighCountedProductOutcome): ScaleWeighing<StableReading> {
  switch (outcome.kind) {
    case "weighed":
      return { kind: "taken", weightThousandths: outcome.weight_thousandths };
    case "weighing":
      return { kind: "weighing" };
    default:
      return { kind: "scale_unavailable" };
  }
}
