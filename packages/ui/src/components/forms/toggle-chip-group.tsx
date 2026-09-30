import { useId } from "react";
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
} from "react-aria-components";
import { type FieldErrorProps, fieldError } from "./field-error";
import { fieldLabelClassName, fieldWrapperGapClassName } from "./field-size";
import {
  disabledTextProps,
  fieldErrorClassName,
  fieldHelperClassName,
  fieldWrapperClassName,
} from "./field-styles";
import type { NarrowedOption } from "./option";

export type ToggleChipOption<V extends string> = NarrowedOption<V> & {
  // Read out in place of the label when the visible one is an abbreviation.
  accessibleName?: string;
};

export type ToggleChipGroupProps<V extends string> = FieldErrorProps & {
  label: string;
  options: readonly [ToggleChipOption<V>, ...ToggleChipOption<V>[]];
  value: readonly NoInfer<V>[];
  onChange: (value: NoInfer<V>[]) => void;
  description?: string;
  disabled?: boolean;
};

const wrapperClassName = `${fieldWrapperClassName} ${fieldWrapperGapClassName.register}`;

const chipRowClassName = "flex flex-row gap-2";

// The 2px ring is an inset box-shadow, not a border, so choosing a chip never changes its size.
const chipClassName =
  "flex h-control-lg min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg " +
  "text-detail text-text outline-none " +
  "bg-surface inset-ring-2 inset-ring-border " +
  "data-hovered:bg-surface-subtle " +
  "data-selected:bg-action data-selected:inset-ring-action data-selected:font-bold data-selected:text-text-inverse " +
  "data-hovered:data-selected:bg-action-strong data-hovered:data-selected:inset-ring-action-strong " +
  "data-focus-visible:focus-ring " +
  "data-disabled:cursor-default";

const invalidChipClassName = "inset-ring-error";

export function ToggleChipGroup<V extends string>(props: ToggleChipGroupProps<V>) {
  const { label, options, value, onChange, description, disabled = false } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);
  const labelId = useId();
  const messageId = useId();

  const showsDescription = !invalid && description !== undefined;
  const describedBy =
    errorMessageId ?? (errorMessage !== undefined || showsDescription ? messageId : undefined);

  return (
    <div data-disabled={disabled || undefined} className={wrapperClassName}>
      <span id={labelId} className={fieldLabelClassName.register} {...disabledTextProps(disabled)}>
        {label}
      </span>
      <AriaToggleButtonGroup
        selectionMode="multiple"
        aria-labelledby={labelId}
        {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
        selectedKeys={value}
        isDisabled={disabled}
        onSelectionChange={(keys) => {
          onChange(options.map((option) => option.value).filter((chosen) => keys.has(chosen)));
        }}
        className={chipRowClassName}
      >
        {options.map((option) => (
          <AriaToggleButton
            key={option.value}
            id={option.value}
            aria-label={option.accessibleName ?? option.label}
            className={`${chipClassName} ${invalid ? invalidChipClassName : ""}`}
          >
            {option.label}
          </AriaToggleButton>
        ))}
      </AriaToggleButtonGroup>
      {errorMessage !== undefined ? (
        <span id={messageId} className={fieldErrorClassName} {...disabledTextProps(disabled)}>
          {errorMessage}
        </span>
      ) : null}
      {showsDescription ? (
        <span id={messageId} className={fieldHelperClassName} {...disabledTextProps(disabled)}>
          {description}
        </span>
      ) : null}
    </div>
  );
}
