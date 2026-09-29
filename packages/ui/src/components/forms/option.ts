import type { Key } from "react-aria-components";
import type { Icon } from "../shared/icon";

export type Option<V extends string = string> = {
  value: V;
  label: string;
  description?: string;
  icon?: Icon;
};

export type Options<O> = readonly [O, ...O[]];

type OptionExtra = "description" | "icon";

// A component narrows the shared Option to what it renders: `Need` fields become mandatory and
// `May` fields stay optional, so any other extra field is not part of its option.
export type NarrowedOption<
  V extends string,
  Need extends OptionExtra = never,
  May extends OptionExtra = never,
> = Pick<Option<V>, "value" | "label"> & {
  [K in Need]-?: Required<Option<V>>[K];
} & {
  [K in May]?: Required<Option<V>>[K];
};

export type OptionChoiceProps<V extends string, O extends Option<V>> = {
  options: Options<O>;
  value: NoInfer<V>;
  onChange: (value: NoInfer<V>) => void;
};

export type OptionalOptionChoiceProps<V extends string, O extends Option<V>> = Omit<
  OptionChoiceProps<V, O>,
  "value"
> & {
  value: NoInfer<V> | null;
};

// react-aria-components reports a chosen option as a plain Key (string | number), or null when
// nothing is chosen.
export function isOptionValue<V extends string>(
  key: Key | null,
  options: readonly { value: V }[],
): key is V {
  return typeof key === "string" && options.some((option) => option.value === key);
}
