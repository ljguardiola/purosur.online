import type { Options } from "@purosur/ui";

export type OptionCreation = { recordKind: string; onCreate: (typedText: string) => void };

type CreatableChoice<Option> =
  | { options: Options<Option>; creation?: OptionCreation }
  | { options: readonly []; creation: OptionCreation };

export function creatableChoice<Option>(
  options: Options<Option> | undefined,
  creation: OptionCreation | undefined,
): CreatableChoice<Option> | undefined {
  if (options) {
    return creation ? { options, creation } : { options };
  }
  return creation ? { options: [], creation } : undefined;
}
