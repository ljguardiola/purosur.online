import { Button, fieldErrorMessage, Modal, TextField, useRequestForm } from "@purosur/ui";
import { Check, Scale } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  addWeighedProductRequestSchema,
  EMPTY_WEIGHT_FORM,
  weightMessage,
  weightRequestFrom,
} from "./weight-form";

export type AddWeighedProductModalProps = {
  productName: string;
  addWeighedProduct: (weightThousandths: number) => Promise<"invalid_weight" | "done">;
  onClose: () => void;
};

export function AddWeighedProductModal({
  productName,
  addWeighedProduct,
  onClose,
}: AddWeighedProductModalProps) {
  const content = useRef<HTMLFormElement>(null);
  const { form, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_WEIGHT_FORM,
    request: { schema: addWeighedProductRequestSchema, from: weightRequestFrom },
    fields: { weight_thousandths: "weight" },
    messages: { weight: (values) => weightMessage(addWeighedProductRequestSchema, values) },
    onSubmit: async (request, { values, showFieldError }) => {
      const answer = await addWeighedProduct(request.weight_thousandths);
      if (answer === "invalid_weight") {
        showFieldError("weight", weightMessage(addWeighedProductRequestSchema, values));
      }
    },
  });

  useEffect(() => {
    content.current?.querySelector("input")?.focus();
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
      title={`Peso de ${productName}`}
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
            Agregar
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
