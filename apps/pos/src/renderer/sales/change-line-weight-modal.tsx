import {
  Button,
  fieldErrorMessage,
  formatWeightInput,
  Modal,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { Check, Scale } from "lucide-react";
import { useEffect, useRef } from "react";
import { changeLineWeightRequestSchema, weightMessage, weightRequestFrom } from "./weight-form";

export type ChangeLineWeightModalProps = {
  productName: string;
  currentWeight: number;
  changeLineWeight: (weightThousandths: number) => Promise<"invalid_weight" | "done">;
  onClose: () => void;
};

export function ChangeLineWeightModal({
  productName,
  currentWeight,
  changeLineWeight,
  onClose,
}: ChangeLineWeightModalProps) {
  const content = useRef<HTMLFormElement>(null);
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { weight: formatWeightInput(currentWeight) },
    request: { schema: changeLineWeightRequestSchema, from: weightRequestFrom },
    fields: { weight_thousandths: "weight" },
    messages: { weight: (values) => weightMessage(changeLineWeightRequestSchema, values) },
    onSubmit: async (request, { values, showFieldError }) => {
      const answer = await changeLineWeight(request.weight_thousandths);
      if (answer === "invalid_weight") {
        showFieldError("weight", weightMessage(changeLineWeightRequestSchema, values));
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
      title={`Cambiar el peso de ${productName}`}
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
            Cambiar peso
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
