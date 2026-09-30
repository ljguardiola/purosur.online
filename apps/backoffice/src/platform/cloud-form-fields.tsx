import type { CalendarDate } from "@internationalized/date";
import {
  DateField,
  type DateFieldProps,
  OptionCardGroup,
  type OptionCardGroupProps,
  QuantityUnitField,
  type QuantityUnitFieldProps,
  SegmentedControl,
  type SegmentedControlProps,
  Select,
  type SelectProps,
  TextField,
  type TextFieldProps,
  ToggleChipGroup,
  type ToggleChipGroupProps,
} from "@purosur/ui";
import { type ReactNode, useId } from "react";
import { useFieldContext } from "./cloud-form-context";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type FieldValueProps = "value" | "onChange" | "errorMessage" | "errorMessageId";

export function fieldErrorMessage(errors: readonly unknown[]): string | undefined {
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
  const field = useFieldContext<string | null>();
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

type QuantityUnitValue<Unit extends string> = { quantity: string; unit: Unit };

export function BoundQuantityUnitField<Unit extends string>(
  props: DistributiveOmit<
    QuantityUnitFieldProps<Unit>,
    FieldValueProps | "quantity" | "onQuantityChange" | "unit" | "onUnitChange"
  >,
) {
  const field = useFieldContext<QuantityUnitValue<Unit>>();
  const { quantity, unit } = field.state.value;
  return (
    <QuantityUnitField
      {...props}
      quantity={quantity}
      onQuantityChange={(next) => field.handleChange({ quantity: next, unit })}
      unit={unit}
      onUnitChange={(next) => field.handleChange({ quantity, unit: next })}
      errorMessage={fieldErrorMessage(field.state.meta.errors)}
    />
  );
}

export function BoundOptionCardGroup<Value extends string>(
  props: DistributiveOmit<OptionCardGroupProps<Value>, FieldValueProps>,
) {
  const field = useFieldContext<Value | null>();
  return (
    <OptionCardGroup
      {...props}
      value={field.state.value}
      onChange={field.handleChange}
      errorMessage={fieldErrorMessage(field.state.meta.errors)}
    />
  );
}

export function BoundSegmentedControl<Value extends string>(
  props: Omit<SegmentedControlProps<Value>, "value" | "onChange">,
) {
  const field = useFieldContext<Value>();
  return <SegmentedControl {...props} value={field.state.value} onChange={field.handleChange} />;
}

export function BoundToggleChipGroup<Value extends string>(
  props: DistributiveOmit<ToggleChipGroupProps<Value>, FieldValueProps>,
) {
  const field = useFieldContext<Value[]>();
  return (
    <ToggleChipGroup
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
