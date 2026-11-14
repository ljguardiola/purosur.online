import { Button, Eyebrow, useRequestForm } from "@purosur/ui";
import type { FormEvent } from "react";
import { useRef } from "react";
import type { DeferredSaleReading } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import {
  deferredSaleFormRequestSchema,
  deferredSaleRequestFrom,
  EMPTY_DEFERRED_SALE_FORM,
  INVALID_SHORT_CODE_MESSAGE,
} from "./deferred-sale-form";

export function DeferredSaleCodeForm({
  disabled,
  lookingUp,
  keysActive,
  onLook,
}: {
  disabled: boolean;
  lookingUp: boolean;
  keysActive: boolean;
  onLook: (reading: DeferredSaleReading) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { form, submit } = useRequestForm({
    defaultValues: EMPTY_DEFERRED_SALE_FORM,
    request: { schema: deferredSaleFormRequestSchema, from: deferredSaleRequestFrom },
    fields: { reading: "code" },
    messages: { code: INVALID_SHORT_CODE_MESSAGE },
    onSubmit: async ({ reading }) => {
      onLook(reading);
    },
  });

  function submitUnlessLookingUp() {
    if (!lookingUp) {
      void submit();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitUnlessLookingUp();
  }

  useKeys(
    [
      {
        key: "F2",
        run: () => formRef.current?.querySelector("input")?.focus(),
        enabled: !disabled,
      },
    ],
    { active: keysActive },
  );
  useKeys([{ key: "Enter", run: submitUnlessLookingUp, enabled: !disabled }], {
    within: formRef,
    active: keysActive,
  });

  return (
    <div className="flex flex-col gap-3">
      <Eyebrow text="SI EL LECTOR NO LEE EL QR" />
      <form ref={formRef} className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
        <form.AppField name="code">
          {(field) => (
            <field.TextField
              kind="plain-text"
              label="Código de consulta"
              labelKeycap="F2"
              disabled={disabled}
            />
          )}
        </form.AppField>
        <Button
          type="submit"
          variant="secondary"
          size="large"
          fullWidth
          disabled={disabled}
          dataStatus={lookingUp ? "loading" : "loaded"}
        >
          Buscar venta
        </Button>
      </form>
    </div>
  );
}
