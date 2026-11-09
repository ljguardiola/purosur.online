import { ListFilter, sortedItems, textOrder } from "@purosur/ui";
import { useEffect, useEffectEvent } from "react";
import { useReportRegistersQuery } from "./installation-queries";
import {
  defaultReportRegisterFilterServices,
  type ReportRegisterFilterServices,
} from "./report-register-filter-services";

export type ReportRegisterFilterProps = {
  value: string;
  onChange: (register: string) => void;
  onLabelChange?: (label: string | undefined) => void;
  onSessionEnded: () => void;
  services?: ReportRegisterFilterServices | undefined;
};

const registerOrder = textOrder((register: { label: string }) => register.label);

export function ReportRegisterFilter({
  value,
  onChange,
  onLabelChange,
  onSessionEnded,
  services,
}: ReportRegisterFilterProps) {
  const registers = useReportRegistersQuery({
    fetchReportRegisters: (services ?? defaultReportRegisterFilterServices).fetchReportRegisters,
    onSessionEnded,
  });
  const reportChange = useEffectEvent(onChange);
  const reportLabel = useEffectEvent((label: string | undefined) => onLabelChange?.(label));
  const registerChosen = value !== "ALL";

  const registersListed = registers.status === "loaded";
  const listedOptions = registersListed
    ? sortedItems(
        registers.value.registers.map(({ id, name }) => ({ value: id, label: name })),
        { order: registerOrder, direction: "ascending" },
      )
    : [];
  const chosenOption = registerChosen && !registersListed ? [{ value, label: "La elegida" }] : [];
  const registerOptions = [
    { value: "ALL", label: "Todas" },
    ...chosenOption,
    ...listedOptions,
  ] satisfies [{ value: string; label: string }, ...{ value: string; label: string }[]];
  const registerOffered = registerOptions.some((option) => option.value === value);

  useEffect(() => {
    if (registersListed && !registerOffered) {
      reportChange("ALL");
    }
  }, [registersListed, registerOffered]);

  const shownLabel =
    registerChosen && registers.status === "loading"
      ? undefined
      : registerOptions.find((option) => option.value === (registerOffered ? value : "ALL"))?.label;

  useEffect(() => {
    reportLabel(shownLabel);
  }, [shownLabel]);

  return (
    <ListFilter
      name="register"
      label="Caja:"
      searchable
      options={registerOptions}
      value={registerOffered ? value : "ALL"}
      onChange={onChange}
    />
  );
}
