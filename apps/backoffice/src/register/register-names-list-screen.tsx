import {
  ButtonLink,
  dataColumn,
  formatNumber,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { createLink, useNavigate } from "@tanstack/react-router";
import { Laptop } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { FetchRegisterNames, RegisterName } from "../platform/register-name";
import type { RegisterPointOfSaleSection } from "../platform/register-point-of-sale-section";
import { type BackofficeAccess, canSeeFiscalConfigurationArea } from "../shell/backoffice-access";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { RegisterPanel } from "./register-panel";
import { useRefreshRegisters, useRegisterNamesQuery } from "./register-queries";
import type { RegistersListScreenServices } from "./registers-list-services";

export type RegisterNamesListScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: RegistersListScreenServices;
  registerPointOfSaleSection: RegisterPointOfSaleSection;
  fetchFiscalRegisterNames: FetchRegisterNames;
  openRegister?: string | undefined;
  tab?: string | undefined;
  sessionsPeriod: ReportPeriodFilters;
  onSessionsPeriodChange: (period: ReportPeriodFilters) => void;
};

const RegisterRowLink = createLink(ButtonLink);

const NO_REGISTERS: RegisterName[] = [];

export function RegisterNamesListScreen({
  access,
  onSessionEnded,
  services,
  registerPointOfSaleSection,
  fetchFiscalRegisterNames,
  openRegister,
  tab,
  sessionsPeriod,
  onSessionsPeriodChange,
}: RegisterNamesListScreenProps) {
  const navigate = useNavigate();
  const refreshRegisters = useRefreshRegisters();
  const fiscal = canSeeFiscalConfigurationArea(access);
  const data = useRegisterNamesQuery({
    source: fiscal ? "fiscal" : "backups",
    fetchRegisterNames: fiscal ? fetchFiscalRegisterNames : services.fetchSnapshotBackupRegisters,
    onSessionEnded,
  });
  const registers = data.status === "loaded" ? data.value : NO_REGISTERS;

  const openRegisterName = registers.find((register) => register.id === openRegister);
  const closeUnlistedRegister = useEffectEvent(() => {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: undefined, tab: undefined }),
      replace: true,
    });
  });
  useEffect(() => {
    if (data.status === "loaded" && openRegister !== undefined && openRegisterName === undefined) {
      closeUnlistedRegister();
    }
  }, [data.status, openRegister, openRegisterName]);

  function closeRegister() {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: undefined, tab: undefined }),
    });
  }

  function openRegisterPanel(id: string) {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: id, tab: undefined }),
    });
  }

  const columns = [
    dataColumn({
      id: "register",
      header: "Caja",
      render: (item: RegisterName) => (
        <TableCellText>
          <RegisterRowLink
            from="/registers"
            to="/registers"
            search={(previous) => ({ ...previous, register: item.id, tab: undefined })}
            variant="text"
          >
            {item.name}
          </RegisterRowLink>
        </TableCellText>
      ),
    }),
  ] as const;

  const table = useTableModel({
    items: registers,
    id: (register) => register.id,
    columns,
  });

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <Table
          aria-label="Cajas registradoras"
          table={table}
          onRowPress={(item) => openRegisterPanel(item.id)}
          rowState={(item) => (item.id === openRegister ? "selected" : undefined)}
          {...cloudTableState(data, "las cajas registradoras")}
          empty={{
            icon: <Laptop />,
            title: "Todavía no hay cajas registradoras",
            description: "Creá la primera para verla en la lista.",
            variant: "blank",
          }}
          footer={
            registers.length === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(registers.length, {
                  one: "1 caja",
                  other: `${formatNumber(registers.length)} cajas`,
                })}
              </p>
            )
          }
        />
      </div>
      {openRegisterName === undefined ? null : (
        <RegisterPanel
          key={openRegisterName.id}
          register={openRegisterName}
          access={access}
          tab={tab}
          sessionsPeriod={sessionsPeriod}
          onSessionsPeriodChange={onSessionsPeriodChange}
          onClose={closeRegister}
          onPointOfSaleSaved={() => void refreshRegisters()}
          onSessionEnded={onSessionEnded}
          services={services}
          registerPointOfSaleSection={registerPointOfSaleSection}
        />
      )}
    </div>
  );
}
