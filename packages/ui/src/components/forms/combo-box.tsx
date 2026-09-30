import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useContext, useState } from "react";
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
  useFilter,
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
import { isOptionValue, type NarrowedOption, type OptionalOptionChoiceProps } from "./option";

export type ComboBoxOption<V extends string> = NarrowedOption<
  V,
  never,
  "description" | "status"
> & {
  // Matched while typing, never shown.
  searchKeywords?: readonly string[];
};

export type ComboBoxProps<V extends string> = FieldErrorProps &
  OptionalOptionChoiceProps<V, ComboBoxOption<V>> & {
    label: string;
    description?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
  };

const NO_RESULTS_TEXT = "Sin resultados";

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

function Chevron() {
  const state = useContext(AriaComboBoxStateContext);
  return state?.isOpen ? (
    <ChevronUp aria-hidden="true" className={chevronClassName} />
  ) : (
    <ChevronDown aria-hidden="true" className={chevronClassName} />
  );
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
  } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);
  const { contains } = useFilter({ sensitivity: "base" });
  const chosen = options.find((option) => option.value === value);
  const [typed, setTyped] = useState<string | null>(null);
  const [shownValue, setShownValue] = useState(value);
  const [listMetrics, setListMetrics] = useState<ListMetrics | null>(null);
  if (value !== shownValue) {
    setShownValue(value);
    setTyped(null);
  }
  const inputValue = typed ?? chosen?.label ?? "";

  const visibleOptions =
    typed === null
      ? options
      : options.filter((option) =>
          [option.label, option.description ?? "", ...(option.searchKeywords ?? [])].some((text) =>
            contains(text, typed),
          ),
        );

  const hasDescriptions = options.some((option) => option.description !== undefined);
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
      items={visibleOptions}
      selectedKey={value}
      // With the input text controlled too, react-aria hands every commit and revert (Escape, Enter
      // with nothing highlighted, leaving the field) back here. It reports no key when the chosen
      // option is outside the narrowed list it holds, so the chosen value stands.
      onSelectionChange={(key) => {
        const picked = isOptionValue(key, options) ? key : value;
        setTyped(null);
        if (picked !== null && picked !== value) {
          onChange(picked);
        }
      }}
      inputValue={inputValue}
      // Showing the chosen option's own label is not a search: the whole list stays available.
      onInputChange={(text) => setTyped(text === chosen?.label ? null : text)}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setListMetrics(readListMetrics());
        }
      }}
      menuTrigger="focus"
      allowsEmptyCollection
      isDisabled={disabled}
      isRequired={required}
      isInvalid={invalid}
      validationBehavior="aria"
      {...(errorMessageId !== undefined ? { "aria-describedby": errorMessageId } : {})}
      className={wrapperClassName}
    >
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
          <Chevron />
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
          <AriaListBox
            className={listBoxClassName}
            renderEmptyState={() => (
              <div className="px-3 py-2 text-detail text-text-subtle">{NO_RESULTS_TEXT}</div>
            )}
          >
            {(option: ComboBoxOption<V>) => (
              <AriaListBoxItem
                id={option.value}
                textValue={option.label}
                className={hasDescriptions ? optionWithDescriptionClassName : optionClassName}
              >
                {({ isSelected }) => (
                  <>
                    <span className="flex min-w-0 flex-col">
                      <AriaText slot="label" className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{option.label}</span>
                        {option.status !== undefined ? (
                          <Tag tone="neutral" variant="status">
                            {option.status}
                          </Tag>
                        ) : null}
                      </AriaText>
                      {option.description !== undefined ? (
                        <AriaText slot="description" className={optionDescriptionClassName}>
                          {option.description}
                        </AriaText>
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
