import { ListFilter, sortedItems, textOrder } from "@purosur/ui";
import { useEffect, useEffectEvent } from "react";
import { useReportRegistersQuery } from "./register-queries";
import {
  defaultReportRegisterFilterServices,
  type ReportRegisterFilterServices,
} from "./report-register-filter-services";

export type ReportRegisterFilterProps = {
  value: string;
  onChange: (register: string) => void;
  onSessionEnded: () => void;
  services?: ReportRegisterFilterServices | undefined;
};

const registerOrder = textOrder((register: { label: string }) => register.label);

export function ReportRegisterFilter({
  value,
  onChange,
  onSessionEnded,
  services,
}: ReportRegisterFilterProps) {
  const registers = useReportRegistersQuery({
    fetchReportRegisters: (services ?? defaultReportRegisterFilterServices).fetchReportRegisters,
    onSessionEnded,
  });
  const reportChange = useEffectEvent(onChange);
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

  return (
    <ListFilter
      name="register"
      label="Caja:"
      options={registerOptions}
      value={registerOffered ? value : "ALL"}
      onChange={onChange}
    />
  );
}
