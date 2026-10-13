import type { ComponentType, ReactNode } from "react";
import type { ReportRegisterFilterProps } from "../register/report-register-filter";

export type ReportRegisterField = (
  field: Pick<ReportRegisterFilterProps, "value" | "onChange">,
) => ReactNode;

export function reportRegisterFieldOf({
  filter: Filter,
  services,
  onSessionEnded,
}: {
  filter: ComponentType<ReportRegisterFilterProps>;
  services: ReportRegisterFilterProps["services"];
  onSessionEnded: () => void;
}): ReportRegisterField {
  return (field) => <Filter {...field} onSessionEnded={onSessionEnded} services={services} />;
}
