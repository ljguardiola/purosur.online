import type { IssuedFiscalDocumentsBody } from "@purosur/contracts";
import {
  dataColumn,
  formatCents,
  ListFilter,
  Pagination,
  SearchField,
  StatusIndicator,
  Table,
  TableCellText,
  type Tone,
  useTableModel,
} from "@purosur/ui";
import { FileText, Search } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { useIssuedFiscalDocumentsQuery } from "./fiscal-queries";
import {
  authorizationDetailText,
  authorizationText,
  documentsCountText,
  issuedDay,
  issuedTime,
  voucherDetailText,
  voucherText,
} from "./issued-fiscal-document-text";
import {
  isDocumentNumberText,
  type IssuedFiscalDocumentsFilters,
  issuedFiscalDocumentsQueryOf,
} from "./issued-fiscal-documents-filters";
import type { IssuedFiscalDocumentsScreenServices } from "./issued-fiscal-documents-services";

export type IssuedFiscalDocumentsScreenProps = {
  filters: IssuedFiscalDocumentsFilters;
  onFiltersChange: (filters: IssuedFiscalDocumentsFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: Pick<IssuedFiscalDocumentsScreenServices, "fetchIssuedFiscalDocuments">;
};

type IssuedFiscalDocument = IssuedFiscalDocumentsBody["documents"][number];

const NO_DOCUMENTS: IssuedFiscalDocument[] = [];

const KIND_OPTIONS = [
  { value: "ALL", label: "Todos" },
  { value: "receipt", label: "Facturas" },
  { value: "credit_note", label: "Notas de crédito" },
] satisfies [
  { value: IssuedFiscalDocumentsFilters["kind"]; label: string },
  ...{ value: IssuedFiscalDocumentsFilters["kind"]; label: string }[],
];

const STATES = {
  authorized: { tone: "success", label: "Autorizado" },
  awaiting_authorization: { tone: "warning", label: "Consultando a ARCA" },
} as const satisfies Record<IssuedFiscalDocument["state"], { tone: Tone; label: string }>;

function documentId(document: IssuedFiscalDocument): string {
  return `${document.voucher_type}-${document.point_of_sale}-${document.number}`;
}

function stateCell(document: IssuedFiscalDocument) {
  const { tone, label } = STATES[document.state];
  const detail = authorizationDetailText(document);
  return (
    <div className="flex flex-col gap-1">
      <div>
        <StatusIndicator tone={tone}>{label}</StatusIndicator>
      </div>
      {detail === undefined ? null : (
        <span className="text-caption text-text-subtle">{detail}</span>
      )}
    </div>
  );
}

const documentColumns = [
  dataColumn({
    id: "issued",
    header: "Emitido",
    render: (document: IssuedFiscalDocument) => (
      <TableCellText description={issuedTime(document)}>{issuedDay(document)}</TableCellText>
    ),
  }),
  dataColumn({
    id: "voucher",
    header: "Comprobante",
    render: (document: IssuedFiscalDocument) => (
      <TableCellText strong description={voucherDetailText(document)}>
        {voucherText(document)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "authorization",
    header: "Autorización",
    render: (document: IssuedFiscalDocument) => (
      <TableCellText tone={document.authorization === null ? "subtle" : undefined}>
        {authorizationText(document.authorization)}
      </TableCellText>
    ),
  }),
  dataColumn({ id: "state", header: "Estado", render: stateCell }),
  dataColumn({
    id: "total",
    header: "Total",
    align: "end",
    render: (document: IssuedFiscalDocument) => (
      <TableCellText strong>{formatCents(document.total)}</TableCellText>
    ),
  }),
] as const;

export function IssuedFiscalDocumentsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: IssuedFiscalDocumentsScreenProps) {
  const [numberText, setNumberText] = useState(filters.number);
  const data = useIssuedFiscalDocumentsQuery({
    query: issuedFiscalDocumentsQueryOf(filters),
    fetchIssuedFiscalDocuments: services.fetchIssuedFiscalDocuments,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.documents ?? NO_DOCUMENTS,
    id: documentId,
    columns: documentColumns,
  });
  const filtered = filters.kind !== "ALL" || filters.register !== "ALL" || filters.number !== "";
  const pageCount = shown === undefined ? 1 : Math.ceil(shown.total / shown.page_size);

  function changeFilters(next: IssuedFiscalDocumentsFilters) {
    const otherFilterChanged =
      JSON.stringify({ ...next, page: 1 }) !== JSON.stringify({ ...filters, page: 1 });
    onFiltersChange(otherFilterChanged && next.page === filters.page ? { ...next, page: 1 } : next);
  }

  function changeNumber(text: string) {
    setNumberText(text);
    if (isDocumentNumberText(text)) {
      changeFilters({ ...filters, number: text });
    }
  }

  return (
    <ScreenLayout
      topBar={
        <ScreenTopBar eyebrow="Caja y fiscal · Fiscal" title="Comprobantes y notas de crédito" />
      }
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          value={numberText}
          onChange={changeNumber}
          placeholder="Buscar por número"
          icon={<Search />}
        />
        <ListFilter
          name="kind"
          label="Tipo:"
          options={KIND_OPTIONS}
          value={filters.kind}
          onChange={(kind) => changeFilters({ ...filters, kind })}
        />
        <ReportFilters
          filters={filters}
          onFiltersChange={changeFilters}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
        />
      </div>
      <Table
        aria-label="Comprobantes y notas de crédito"
        table={table}
        {...cloudTableState(data, "los comprobantes")}
        empty={{
          icon: <FileText />,
          title: filtered
            ? "No hay comprobantes que coincidan con los filtros"
            : "No hay comprobantes en este período",
          variant: filtered ? "filtered" : "blank",
        }}
        footer={
          shown === undefined || shown.total === 0 ? undefined : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-text-subtle text-detail">
                {documentsCountText(shown.total, shown.range)}
              </p>
              {pageCount > 1 ? (
                <Pagination
                  page={filters.page}
                  pageCount={pageCount}
                  onPageChange={(page) => changeFilters({ ...filters, page })}
                  label="Páginas de comprobantes"
                />
              ) : null}
            </div>
          )
        }
      />
    </ScreenLayout>
  );
}
