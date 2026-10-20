import type { ManualDiscountsBody } from "@purosur/contracts";
import { ListFilter } from "@purosur/ui";
import { useEffect, useEffectEvent } from "react";

type Option = { value: string; label: string };

export type ManualDiscountsAuthorizerFilterProps = {
  value: string;
  authorizers: ManualDiscountsBody["authorizers"] | undefined;
  onChange: (authorizedBy: string) => void;
};

const UNIDENTIFIED = "Sin identificar";

export function ManualDiscountsAuthorizerFilter({
  value,
  authorizers,
  onChange,
}: ManualDiscountsAuthorizerFilterProps) {
  const reportChange = useEffectEvent(onChange);
  const authorizerChosen = value !== "ALL";

  const listedOptions = (authorizers ?? []).map(({ id, name }) => ({
    value: id,
    label: name ?? UNIDENTIFIED,
  }));
  const chosenOption =
    authorizerChosen && authorizers === undefined ? [{ value, label: "El elegido" }] : [];
  const options = [{ value: "ALL", label: "Todos" }, ...chosenOption, ...listedOptions] satisfies [
    Option,
    ...Option[],
  ];
  const authorizerOffered = options.some((option) => option.value === value);

  useEffect(() => {
    if (authorizers !== undefined && !authorizerOffered) {
      reportChange("ALL");
    }
  }, [authorizers, authorizerOffered]);

  return (
    <ListFilter
      name="authorizedBy"
      label="Autorizó:"
      options={options}
      value={authorizerOffered ? value : "ALL"}
      onChange={onChange}
    />
  );
}
