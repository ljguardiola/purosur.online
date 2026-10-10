import { Button, fieldErrorMessage, Modal, TextField, useRequestForm } from "@purosur/ui";
import { Check, Scale } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  EMPTY_WEIGHT_FORM,
  INVALID_WEIGHT_MESSAGE,
  weightFieldText,
  weightRequestFrom,
  weightRequestSchema,
} from "./weight-form";

export type WeightModalProps = {
  productName: string;
  currentWeight: number | undefined;
  confirm: (weightThousandths: number) => Promise<"invalid_weight" | "done">;
  onClose: () => void;
};

export function WeightModal({ productName, currentWeight, confirm, onClose }: WeightModalProps) {
  const content = useRef<HTMLFormElement>(null);
  const changing = currentWeight !== undefined;
  const { form, submit, submitting } = useRequestForm({
    defaultValues: changing ? { weight: weightFieldText(currentWeight) } : EMPTY_WEIGHT_FORM,
    request: { schema: weightRequestSchema, from: weightRequestFrom },
    fields: { weight_thousandths: "weight" },
    messages: { weight: INVALID_WEIGHT_MESSAGE },
    onSubmit: async (request, { showFieldError }) => {
      const answer = await confirm(request.weight_thousandths);
      if (answer === "invalid_weight") {
        showFieldError("weight", INVALID_WEIGHT_MESSAGE);
      }
    },
  });

  useEffect(() => {
    content.current?.querySelector("input")?.select();
  }, []);

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
      icon={<Scale />}
      title={changing ? `Cambiar el peso de ${productName}` : `Peso de ${productName}`}
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
            {changing ? "Cambiar peso" : "Agregar"}
          </Button>
        </>
      }
    >
      <form
        ref={content}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <form.AppField name="weight">
          {(field) => (
            <TextField
              kind="weight"
              suffix="kg"
              label="Peso en kg"
              inputMode="numeric"
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              errorMessage={fieldErrorMessage(field.state.meta.errors)}
            />
          )}
        </form.AppField>
      </form>
    </Modal>
  );
}
