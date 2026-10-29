import { ChevronDown, ChevronUp } from "lucide-react";
import { useContext, useState } from "react";
import {
  ComboBoxStateContext as AriaComboBoxStateContext,
  type Key,
  useFilter,
} from "react-aria-components";
import { isOptionValue } from "./option";

const NO_RESULTS_TEXT = "Sin resultados";

type NarrowableOption<V extends string> = { value: V; label: string };

type UseTypeToNarrowArgs<V extends string, O extends NarrowableOption<V>> = {
  options: readonly O[];
  value: V | null;
  onChange: (value: V) => void;
  matchTexts?: (option: O) => readonly string[];
};

export function useTypeToNarrow<V extends string, O extends NarrowableOption<V>>({
  options,
  value,
  onChange,
  matchTexts = (option) => [option.label],
}: UseTypeToNarrowArgs<V, O>) {
  const { contains } = useFilter({ sensitivity: "base" });
  const chosen = options.find((option) => option.value === value);
  const [typed, setTyped] = useState<string | null>(null);
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setTyped(null);
  }

  const items =
    typed === null
      ? options
      : options.filter((option) => matchTexts(option).some((text) => contains(text, typed)));

  const comboBoxProps = {
    items,
    selectedKey: value,
    // With the input text controlled too, react-aria hands every commit and revert (Escape, Enter
    // with nothing highlighted, leaving the field) back here. It reports no key when the chosen
    // option is outside the narrowed list it holds, so the chosen value stands.
    onSelectionChange: (key: Key | null) => {
      const picked = isOptionValue(key, options) ? key : value;
      setTyped(null);
      if (picked !== null && picked !== value) {
        onChange(picked);
      }
    },
    inputValue: typed ?? chosen?.label ?? "",
    // Showing the chosen option's own label is not a search: the whole list stays available.
    onInputChange: (text: string) => setTyped(text === chosen?.label ? null : text),
    menuTrigger: "focus",
    allowsEmptyCollection: true,
  } as const;

  return { chosen, comboBoxProps };
}

export function SelectCaret({ className }: { className: string }) {
  const state = useContext(AriaComboBoxStateContext);
  return state?.isOpen ? (
    <ChevronUp aria-hidden="true" className={className} />
  ) : (
    <ChevronDown aria-hidden="true" className={className} />
  );
}

export function NoResults() {
  return <div className="px-3 py-2 text-detail text-text-subtle">{NO_RESULTS_TEXT}</div>;
}
