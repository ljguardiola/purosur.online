import type { CalendarDate } from "@internationalized/date";
import {
  DateField,
  type DateFieldProps,
  Select,
  type SelectProps,
  TextField,
  type TextFieldProps,
} from "@purosur/ui";
import { type ReactNode, useId } from "react";
import { useFieldContext } from "./cloud-form-context";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type FieldValueProps = "value" | "onChange" | "errorMessage" | "errorMessageId";

function fieldErrorMessage(errors: readonly unknown[]): string | undefined {
  const [first] = errors;
  return typeof first === "string" ? first : undefined;
}

export function BoundTextField(props: DistributiveOmit<TextFieldProps, FieldValueProps>) {
  const field = useFieldContext<string>();
  return (
    <TextField
      {...props}
      value={field.state.value}
      onChange={field.handleChange}
      errorMessage={fieldErrorMessage(field.state.meta.errors)}
    />
  );
}

export function BoundSelect(props: DistributiveOmit<SelectProps<string>, FieldValueProps>) {
  const field = useFieldContext<string>();
  return (
    <Select
      {...props}
      value={field.state.value}
      onChange={field.handleChange}
      errorMessage={fieldErrorMessage(field.state.meta.errors)}
    />
  );
}

export function BoundDateField(props: DistributiveOmit<DateFieldProps, FieldValueProps>) {
  const field = useFieldContext<CalendarDate | null>();
  return (
    <DateField
      {...props}
      value={field.state.value}
      onChange={field.handleChange}
      errorMessage={fieldErrorMessage(field.state.meta.errors)}
    />
  );
}

type SharedFieldErrorProps = {
  children: (errorMessageId: string | undefined) => ReactNode;
};

export function SharedFieldError({ children }: SharedFieldErrorProps) {
  const field = useFieldContext();
  const errorMessageId = useId();
  const message = fieldErrorMessage(field.state.meta.errors);
  return (
    <>
      {children(message === undefined ? undefined : errorMessageId)}
      {message !== undefined && (
        <p id={errorMessageId} className="text-detail text-error">
          {message}
        </p>
      )}
    </>
  );
}
