import type { ComponentType, ReactNode } from "react";
import { createContext } from "react";
import type { ReportRegisterFilterProps } from "../register/report-register-filter";

type RegisterField = Pick<ReportRegisterFilterProps, "value" | "onChange">;

export const ReportRegisterFilterSlot = createContext<(field: RegisterField) => ReactNode>(
  () => null,
);

export function ReportRegisterFilterProvider({
  filter: Filter,
  services,
  onSessionEnded,
  children,
}: {
  filter: ComponentType<ReportRegisterFilterProps>;
  services: ReportRegisterFilterProps["services"];
  onSessionEnded: () => void;
  children: ReactNode;
}) {
  return (
    <ReportRegisterFilterSlot
      value={(field) => <Filter {...field} onSessionEnded={onSessionEnded} services={services} />}
    >
      {children}
    </ReportRegisterFilterSlot>
  );
}
