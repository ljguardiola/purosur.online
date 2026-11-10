import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  Button as AriaButton,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from "react-aria-components";
import { Keycap } from "../data-display/keycap";
import { Avatar } from "../shared/avatar";
import { fieldLabelClassName } from "./field-size";
import {
  fieldTriggerHoverClassName,
  fieldWrapperClassName,
  menuOptionFrameClassName,
  menuPopoverStyle,
  menuSurfaceClassName,
} from "./field-styles";
import { isOptionValue, type NarrowedOption, type OptionalOptionChoiceProps } from "./option";

export type UserSelectProps<V extends string> = OptionalOptionChoiceProps<V, NarrowedOption<V>> & {
  label: string;
  placeholder?: string;
  disabled?: boolean;
};

const triggerClassName =
  "flex h-16 min-w-0 max-w-full items-center gap-3 rounded-lg border-2 bg-surface px-3 outline-none " +
  `border-border ${fieldTriggerHoverClassName} data-focused:border-action ` +
  "data-pressed:border-action";

const popoverClassName = `min-w-trigger w-trigger p-1.5 overflow-y-auto ${menuSurfaceClassName}`;

const optionClassName = `h-16 gap-3 ${menuOptionFrameClassName}`;

const chevronClassName = "size-icon-md shrink-0 text-text-subtle";

export function UserSelect<V extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
}: UserSelectProps<V>) {
  const placeholderProps = placeholder !== undefined ? { placeholder } : {};

  return (
    <AriaSelect
      selectedKey={value}
      onSelectionChange={(key) => {
        if (isOptionValue(key, options)) {
          onChange(key);
        }
      }}
      {...placeholderProps}
      isDisabled={disabled}
      className={`${fieldWrapperClassName} gap-1.5`}
    >
      {({ isOpen }) => (
        <>
          <div className="flex items-center gap-2">
            <AriaLabel className={fieldLabelClassName.register}>{label}</AriaLabel>
            <Keycap keyName="ArrowUp" />
            <Keycap keyName="ArrowDown" />
          </div>
          <AriaButton className={triggerClassName}>
            <AriaSelectValue className="flex min-w-0 flex-1 items-center gap-3 text-body font-semibold text-text data-placeholder:font-normal data-placeholder:text-text-subtle">
              {({ selectedText, isPlaceholder }) =>
                isPlaceholder ? (
                  <span className="min-w-0 truncate">{placeholder}</span>
                ) : (
                  <>
                    <Avatar label={selectedText} />
                    <span className="min-w-0 truncate">{selectedText}</span>
                  </>
                )
              }
            </AriaSelectValue>
            {isOpen ? (
              <ChevronUp aria-hidden="true" className={chevronClassName} />
            ) : (
              <ChevronDown aria-hidden="true" className={chevronClassName} />
            )}
          </AriaButton>
          <AriaPopover offset={4} style={menuPopoverStyle} className={popoverClassName}>
            <AriaListBox className="flex flex-col gap-1">
              {options.map((option) => (
                <AriaListBoxItem
                  key={option.value}
                  id={option.value}
                  textValue={option.label}
                  className={optionClassName}
                >
                  {({ isSelected }) => (
                    <>
                      <Avatar label={option.label} />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {isSelected ? (
                        <Check
                          aria-hidden="true"
                          className="size-icon-md shrink-0 text-text-accent"
                        />
                      ) : null}
                    </>
                  )}
                </AriaListBoxItem>
              ))}
            </AriaListBox>
          </AriaPopover>
        </>
      )}
    </AriaSelect>
  );
}
