import { Plus, X } from "lucide-react";
import { useId, useRef } from "react";
import {
  Button as AriaButton,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuTrigger as AriaMenuTrigger,
  Popover as AriaPopover,
  Separator as AriaSeparator,
} from "react-aria-components";
import { flushSync } from "react-dom";
import { type TagTone, tagDotClassName, tagToneClassName } from "../data-display/tag-styles";
import { iconSlotClassName } from "../shared/icon";
import { type FieldErrorProps, fieldError } from "./field-error";
import {
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
} from "./field-size";
import {
  disabledTextProps,
  fieldErrorClassName,
  fieldHelperClassName,
  fieldWrapperClassName,
  menuOptionClassName,
  menuPopoverStyle,
  menuSurfaceClassName,
} from "./field-styles";
import type { NarrowedOption } from "./option";

export type ChipListFieldProps<V extends string> = FieldErrorProps & {
  label: string;
  // Every option the field knows, chosen or not. One with a status is kept by a value that already
  // has it but is never offered again; the status is read out by assistive technology.
  options: readonly NarrowedOption<V, never, "status">[];
  value: readonly NoInfer<V>[];
  onChange: (value: NoInfer<V>[]) => void;
  addLabel: string;
  create?: { label: string; onAction: () => void };
  description?: string;
  disabled?: boolean;
  required?: boolean;
};

const wrapperClassName = `${fieldWrapperClassName} ${fieldWrapperGapClassName.backoffice}`;

const labelClassName = fieldLabelClassName.backoffice;
const requiredLabelClassName = `${labelClassName} ${requiredFieldLabelSuffixClassName}`;

const chipListClassName = "flex flex-wrap items-center gap-2";

const pillClassName =
  "inline-flex h-control-xs items-center rounded-full text-detail font-semibold";

const chipClassName = `${pillClassName} gap-2 pl-3 pr-1`;

const chipToneClassName = {
  active: { tone: "info", removeHover: "data-hovered:bg-action-soft" },
  inactive: { tone: "neutral", removeHover: "data-hovered:bg-surface-soft" },
} as const satisfies Record<string, { tone: TagTone; removeHover: string }>;

const removeButtonClassName =
  "inline-flex size-control-2xs shrink-0 items-center justify-center rounded-full outline-none " +
  "transition-background data-focus-visible:focus-ring-tight data-disabled:opacity-disabled";

const addPillClassName =
  `${pillClassName} gap-1 border-2 border-action bg-transparent px-3 text-text-accent outline-none ` +
  "transition-background data-hovered:bg-action-subtle " +
  "data-focus-visible:focus-ring data-disabled:opacity-disabled";

const popoverClassName = `min-w-56 p-1.5 overflow-y-auto ${menuSurfaceClassName}`;

export function ChipListField<V extends string>(props: ChipListFieldProps<V>) {
  const {
    label,
    options,
    value,
    onChange,
    addLabel,
    create,
    description,
    disabled = false,
    required = false,
  } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);
  const labelId = useId();
  const messageId = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);

  const chips = value.flatMap((chosen) => {
    const option = options.find((candidate) => candidate.value === chosen);
    return option === undefined ? [] : [option];
  });
  const offered = options.filter(
    (option) => option.status === undefined && !value.includes(option.value),
  );

  const showsDescription = !invalid && description !== undefined;
  const describedBy =
    errorMessageId ?? (errorMessage !== undefined || showsDescription ? messageId : undefined);

  // The chip's own button is about to disappear, so focus is placed on what takes its position
  // once the value has been re-rendered, or on the field itself when nothing in it can take focus,
  // so focus never drops to the page.
  function remove(chosen: V, position: number) {
    flushSync(() => onChange(value.filter((other) => other !== chosen)));
    const buttons =
      fieldsetRef.current?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? [];
    const target = buttons[Math.min(position, buttons.length - 1)] ?? fieldsetRef.current;
    target?.focus();
  }

  return (
    <fieldset
      ref={fieldsetRef}
      tabIndex={-1}
      aria-labelledby={labelId}
      {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
      data-disabled={disabled || undefined}
      className={`min-w-0 outline-none ${wrapperClassName}`}
    >
      <span
        id={labelId}
        className={required ? requiredLabelClassName : labelClassName}
        {...disabledTextProps(disabled)}
      >
        {label}
      </span>
      <ul className={chipListClassName}>
        {chips.map((option, position) => {
          const { tone, removeHover } =
            chipToneClassName[option.status === undefined ? "active" : "inactive"];
          return (
            <li
              key={option.value}
              className={`${chipClassName} ${tagToneClassName[tone]}`}
              {...disabledTextProps(disabled)}
            >
              {option.status !== undefined ? (
                <span aria-hidden="true" className={tagDotClassName[tone]} />
              ) : null}
              {option.label}
              {option.status !== undefined ? (
                <span className="sr-only">{option.status}</span>
              ) : null}
              <AriaButton
                aria-label={`Quitar ${option.label}`}
                isDisabled={disabled}
                onPress={() => remove(option.value, position)}
                className={`${removeButtonClassName} ${removeHover}`}
              >
                <span aria-hidden="true" className={iconSlotClassName["2xs"]}>
                  <X />
                </span>
              </AriaButton>
            </li>
          );
        })}
        <li className="flex">
          <AriaMenuTrigger>
            <AriaButton
              isDisabled={disabled || (offered.length === 0 && create === undefined)}
              className={addPillClassName}
            >
              <span aria-hidden="true" className={iconSlotClassName.sm}>
                <Plus />
              </span>
              {addLabel}
            </AriaButton>
            <AriaPopover
              placement="bottom start"
              offset={4}
              style={menuPopoverStyle}
              className={popoverClassName}
            >
              <AriaMenu className="flex flex-col gap-1 outline-none">
                {offered.map((option) => (
                  <AriaMenuItem
                    key={option.value}
                    textValue={option.label}
                    onAction={() => onChange([...value, option.value])}
                    className={menuOptionClassName}
                  >
                    {option.label}
                  </AriaMenuItem>
                ))}
                {create !== undefined && offered.length > 0 ? (
                  <AriaSeparator className="mx-1.5 my-0.5 border-t border-border" />
                ) : null}
                {create !== undefined ? (
                  <AriaMenuItem
                    textValue={create.label}
                    onAction={create.onAction}
                    className={menuOptionClassName}
                  >
                    {create.label}
                  </AriaMenuItem>
                ) : null}
              </AriaMenu>
            </AriaPopover>
          </AriaMenuTrigger>
        </li>
      </ul>
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
    </fieldset>
  );
}
