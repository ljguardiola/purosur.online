import { Check } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  ComboBoxStateContext as AriaComboBoxStateContext,
  Input as AriaInput,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListLayout as AriaListLayout,
  Popover as AriaPopover,
  Text as AriaText,
  Virtualizer as AriaVirtualizer,
} from "react-aria-components";
import { Tag } from "../data-display/tag";
import { type FieldErrorProps, fieldError } from "./field-error";
import {
  backofficeFieldHeightClassName,
  backofficeFieldValueClassName,
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
} from "./field-size";
import {
  disabledTextProps,
  fieldBoxClassName,
  fieldBoxStateClassName,
  fieldErrorClassName,
  fieldHelperClassName,
  fieldWrapperClassName,
  menuOptionFrameClassName,
  menuPopoverStyle,
  menuSurfaceClassName,
} from "./field-styles";
import type { NarrowedOption, OptionalOptionChoiceProps } from "./option";
import { NoResults, SelectCaret, useTypeToNarrow } from "./type-to-narrow";

export type ComboBoxOption<V extends string> = NarrowedOption<
  V,
  never,
  "description" | "status"
> & {
  // Matched while typing, never shown.
  searchKeywords?: readonly string[];
};

type ComboBoxCreation = { recordKind: string; onCreate: (typedText: string) => void };

type ComboBoxChoice<V extends string> = Omit<
  OptionalOptionChoiceProps<V, ComboBoxOption<V>>,
  "options"
> &
  (
    | {
        options: OptionalOptionChoiceProps<V, ComboBoxOption<V>>["options"];
        creation?: ComboBoxCreation;
      }
    | { options: readonly ComboBoxOption<V>[]; creation: ComboBoxCreation }
  );

export type ComboBoxProps<V extends string> = FieldErrorProps &
  ComboBoxChoice<V> & {
    label: string;
    description?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
  };

const CREATE_ENTRY_KEY = "\u0000create";

const wrapperClassName = `${fieldWrapperClassName} ${fieldWrapperGapClassName.backoffice}`;

const baseLabelClassName = fieldLabelClassName.backoffice;
const requiredLabelClassName = `${baseLabelClassName} ${requiredFieldLabelSuffixClassName}`;

// The input and the button fill the box edge to edge, so the list opens as wide as the box.
const inputClassName =
  `h-full min-w-0 flex-1 bg-transparent pl-3 caret-focus outline-none ${backofficeFieldValueClassName} ` +
  "placeholder:font-normal placeholder:text-text-subtle";

const chevronButtonClassName = "flex h-full shrink-0 items-center px-3 outline-none";
const chevronClassName = "size-icon-md text-text-subtle";

const popoverClassName = `min-w-trigger w-trigger ${menuSurfaceClassName}`;
const listBoxClassName = "max-h-inherit overflow-auto outline-none";

const optionDescriptionClassName = "truncate text-detail font-normal text-text-subtle";

// The virtualized list needs every row's height up front in pixels, so a row is one of two fixed
// heights, read from the same rem tokens the rows are drawn with once the page's font size is known.
const optionClassName = `h-control-lg ${menuOptionFrameClassName} data-focused:bg-surface-subtle`;
const optionWithDescriptionClassName = `h-control-3xl ${menuOptionFrameClassName} data-focused:bg-surface-subtle`;

type ListMetrics = {
  rowHeight: number;
  rowWithDescriptionHeight: number;
  padding: number;
  gap: number;
};

function readListMetrics(): ListMetrics {
  const root = getComputedStyle(document.documentElement);
  const remPixels = Number.parseFloat(root.fontSize);
  const tokenPixels = (name: string) => Number.parseFloat(root.getPropertyValue(name)) * remPixels;
  const spacing = tokenPixels("--spacing");
  return {
    rowHeight: tokenPixels("--spacing-control-lg"),
    rowWithDescriptionHeight: tokenPixels("--spacing-control-3xl"),
    padding: spacing * 1.5,
    gap: spacing,
  };
}

// Choosing the creation entry leaves the chosen value as it was, so react-aria has no selection
// change to close the list on.
function CloseListWhenCreated({ createdCount }: { createdCount: number }) {
  const state = useContext(AriaComboBoxStateContext);
  useEffect(() => {
    if (createdCount > 0) {
      state?.close();
    }
  }, [createdCount, state]);
  return null;
}

export function ComboBox<V extends string>(props: ComboBoxProps<V>) {
  const {
    label,
    options,
    value,
    onChange,
    description,
    placeholder,
    disabled = false,
    required = false,
    creation,
  } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);
  const [createdCount, setCreatedCount] = useState(0);
  const [listMetrics, setListMetrics] = useState<ListMetrics | null>(null);
  const { chosen, typed, dropTypedText, comboBoxProps } = useTypeToNarrow({
    options,
    value,
    onChange,
    matchTexts: (option) => [
      option.label,
      option.description ?? "",
      ...(option.searchKeywords ?? []),
    ],
  });

  const typedText = typed?.trim() ?? "";
  const offersCreation =
    creation !== undefined && typedText !== "" && comboBoxProps.items.length === 0;
  const createLabel = offersCreation ? `Crear ${creation.recordKind} «${typedText}»` : null;
  const items: readonly ComboBoxOption<string>[] =
    createLabel !== null ? [{ value: CREATE_ENTRY_KEY, label: createLabel }] : comboBoxProps.items;

  const hasDescriptions =
    !offersCreation && options.some((option) => option.description !== undefined);
  const listLayoutOptions =
    listMetrics === null
      ? {}
      : {
          rowHeight: hasDescriptions ? listMetrics.rowWithDescriptionHeight : listMetrics.rowHeight,
          padding: listMetrics.padding,
          gap: listMetrics.gap,
        };

  const placeholderProps = placeholder !== undefined ? { placeholder } : {};

  return (
    <AriaComboBox
      {...comboBoxProps}
      items={items}
      onSelectionChange={(key) => {
        comboBoxProps.onSelectionChange(key);
        if (key === CREATE_ENTRY_KEY && offersCreation) {
          dropTypedText();
          setCreatedCount(createdCount + 1);
          creation.onCreate(typedText);
        }
      }}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setListMetrics(readListMetrics());
        }
      }}
      isDisabled={disabled}
      isRequired={required}
      isInvalid={invalid}
      validationBehavior="aria"
      {...(errorMessageId !== undefined ? { "aria-describedby": errorMessageId } : {})}
      className={wrapperClassName}
    >
      <CloseListWhenCreated createdCount={createdCount} />
      <AriaLabel className={required ? requiredLabelClassName : baseLabelClassName}>
        {label}
      </AriaLabel>
      <div
        className={`${fieldBoxClassName} ${backofficeFieldHeightClassName} ${fieldBoxStateClassName({ disabled, invalid })}`}
      >
        <AriaInput className={inputClassName} {...placeholderProps} />
        {chosen?.status !== undefined ? (
          <Tag tone="neutral" variant="status">
            {chosen.status}
          </Tag>
        ) : null}
        <AriaButton className={chevronButtonClassName}>
          <SelectCaret className={chevronClassName} />
        </AriaButton>
      </div>
      {errorMessage !== undefined ? (
        <AriaText
          slot="errorMessage"
          className={fieldErrorClassName}
          {...disabledTextProps(disabled)}
        >
          {errorMessage}
        </AriaText>
      ) : (
        !invalid &&
        description !== undefined && (
          <AriaText
            slot="description"
            className={fieldHelperClassName}
            {...disabledTextProps(disabled)}
          >
            {description}
          </AriaText>
        )
      )}
      {/* The list is exactly as wide as the field, so keeping it any distance from the page's edge
          pushes a field that reaches that edge past the other one. The page then scrolls sideways
          as the keyboard moves through the options, and any page scroll closes this list. */}
      <AriaPopover
        offset={4}
        containerPadding={0}
        style={menuPopoverStyle}
        className={popoverClassName}
      >
        <AriaVirtualizer layout={AriaListLayout} layoutOptions={listLayoutOptions}>
          <AriaListBox className={listBoxClassName} renderEmptyState={() => <NoResults />}>
            {(option: ComboBoxOption<string>) => (
              <AriaListBoxItem
                id={option.value}
                textValue={option.label}
                className={hasDescriptions ? optionWithDescriptionClassName : optionClassName}
              >
                {({ isSelected }) => (
                  <>
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{option.label}</span>
                        {option.status !== undefined ? (
                          <>
                            {" "}
                            <Tag tone="neutral" variant="status">
                              {option.status}
                            </Tag>
                          </>
                        ) : null}
                      </span>
                      {option.description !== undefined ? (
                        <>
                          {" "}
                          <span className={optionDescriptionClassName}>{option.description}</span>
                        </>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <Check
                        aria-hidden="true"
                        className="size-icon-md shrink-0 text-text-accent"
                      />
                    ) : null}
                  </>
                )}
              </AriaListBoxItem>
            )}
          </AriaListBox>
        </AriaVirtualizer>
      </AriaPopover>
    </AriaComboBox>
  );
}
