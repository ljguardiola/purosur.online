import type { IssuedFiscalDocumentDetailBody } from "@purosur/contracts";
import {
  Button,
  DocumentList,
  type DocumentRowProps,
  dataColumn,
  EmptyState,
  Eyebrow,
  formatCents,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  StatusIndicator,
  SummaryRowGroup,
  Table,
  TableCellText,
  type Tone,
  useTableModel,
} from "@purosur/ui";
import { ArrowLeft, Banknote, FileMinus, FileSearch, FileText, Package } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { paymentLabel } from "../platform/payment-label";
import { saleUnitQuantityText } from "../platform/sale-unit-quantity";
import { useIssuedFiscalDocumentQuery } from "./fiscal-queries";
import {
  authorizationDetailText,
  authorizationText,
  buyerText,
  correctedVoucherText,
  issuedDay,
  issuedTime,
  voucherText,
} from "./issued-fiscal-document-text";
import type { fetchIssuedFiscalDocument } from "./issued-fiscal-documents-api";

export type IssuedFiscalDocumentDetailModalServices = {
  fetchIssuedFiscalDocument: typeof fetchIssuedFiscalDocument;
};

type Voucher = { voucher_type: number; point_of_sale: number; number: number };

type IssuedFiscalDocumentDetailModalProps = {
  voucher: Voucher | null;
  onClose: () => void;
  onSessionEnded: () => void;
  services: IssuedFiscalDocumentDetailModalServices;
};

type Detail = IssuedFiscalDocumentDetailBody;
type Numbered<T> = { index: number; item: T };

const STATES = {
  authorized: { tone: "success", label: "Autorizado" },
  awaiting_authorization: { tone: "warning", label: "Consultando a ARCA" },
} as const satisfies Record<Detail["state"], { tone: Tone; label: string }>;

const lineColumns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: ({ item }: Numbered<Detail["lines"][number]>) => (
      <TableCellText description={item.promotion?.name}>{item.product_name}</TableCellText>
    ),
  }),
  dataColumn({
    id: "quantity",
    header: "Cantidad",
    render: ({ item }: Numbered<Detail["lines"][number]>) =>
      saleUnitQuantityText(item.sale_unit, item.quantity),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: ({ item }: Numbered<Detail["lines"][number]>) => formatCents(item.amount),
  }),
] as const;

const paymentColumns = [
  dataColumn({
    id: "method",
    header: "Medio de pago",
    render: ({ item }: Numbered<Detail["payments"][number]>) =>
      paymentLabel(item.method, item.card_type),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: ({ item }: Numbered<Detail["payments"][number]>) => formatCents(item.amount),
  }),
] as const;

function numbered<T>(items: readonly T[]): Numbered<T>[] {
  return items.map((item, index) => ({ index, item }));
}

function LinesTable({ lines }: { lines: Detail["lines"] }) {
  const table = useTableModel({
    items: numbered(lines),
    id: ({ index }) => String(index),
    columns: lineColumns,
  });
  return (
    <Table
      aria-label="Productos vendidos"
      table={table}
      empty={{ icon: <Package />, title: "Sin productos asociados.", variant: "blank" }}
    />
  );
}

function PaymentsTable({ payments }: { payments: Detail["payments"] }) {
  const table = useTableModel({
    items: numbered(payments),
    id: ({ index }) => String(index),
    columns: paymentColumns,
  });
  return (
    <Table
      aria-label="Pagos"
      table={table}
      empty={{ icon: <Banknote />, title: "Sin pagos asociados.", variant: "blank" }}
    />
  );
}

function creditNoteRow(creditNote: Detail["credit_notes"][number]): DocumentRowProps {
  return {
    title: voucherText(creditNote),
    detail: `${issuedDay(creditNote)} · ${formatCents(creditNote.total)}`,
    status: (
      <StatusIndicator tone={STATES[creditNote.state].tone}>
        {STATES[creditNote.state].label}
      </StatusIndicator>
    ),
  };
}

function CreditNotes({ creditNotes }: { creditNotes: Detail["credit_notes"] }) {
  const [first, ...others] = creditNotes;
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow text="Notas de crédito" headingLevel={2} />
      {first === undefined ? (
        <EmptyState icon={<FileMinus />} title="Sin notas de crédito asociadas." variant="blank" />
      ) : (
        <DocumentList
          label="Notas de crédito"
          rows={[creditNoteRow(first), ...others.map(creditNoteRow)]}
        />
      )}
    </div>
  );
}

function DocumentDetail({ document }: { document: Detail }) {
  const { tone, label } = STATES[document.state];
  const stateDetail = authorizationDetailText(document);
  return (
    <>
      <div className="flex flex-col gap-1">
        <div>
          <StatusIndicator tone={tone}>{label}</StatusIndicator>
        </div>
        {stateDetail === undefined ? null : (
          <span className="text-caption text-text-subtle">{stateDetail}</span>
        )}
      </div>
      {document.corrected_voucher === null ? null : (
        <p className="text-body">{correctedVoucherText(document.corrected_voucher)}</p>
      )}
      <SummaryRowGroup
        variant="filled"
        rows={[
          { label: "Autorización", value: authorizationText(document.authorization) },
          { label: "Emitido", value: `${issuedDay(document)} · ${issuedTime(document)}` },
          { label: "Caja", value: document.register.name },
          { label: "Comprador", value: buyerText(document.buyer) },
        ]}
      />
      <div className="flex flex-col gap-2">
        <Eyebrow text="Productos" headingLevel={2} />
        <LinesTable lines={document.lines} />
        <SummaryRowGroup
          variant="plain"
          rows={[{ label: "Total", value: formatCents(document.total), strong: true }]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Eyebrow text="Pagos" headingLevel={2} />
        <PaymentsTable payments={document.payments} />
      </div>
      {document.kind === "receipt" ? <CreditNotes creditNotes={document.credit_notes} /> : null}
    </>
  );
}

function OpenIssuedFiscalDocumentDetailModal({
  voucher,
  onClose,
  onSessionEnded,
  services,
}: IssuedFiscalDocumentDetailModalProps & { voucher: Voucher }) {
  const data = useIssuedFiscalDocumentQuery({
    voucher,
    fetchIssuedFiscalDocument: services.fetchIssuedFiscalDocument,
    onSessionEnded,
  });
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<FileText />}
      context="Comprobante"
      title={voucherText(voucher)}
      footer={
        <Button variant="secondary" size="large" icon={<ArrowLeft />} onPress={onClose}>
          Volver
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {data.status === "loading" ? <LoadingPlaceholder variant="card" lines={4} /> : null}
        {data.status === "failed" ? (
          <LoadFailure {...cloudLoadFailure(data, "el comprobante")} />
        ) : null}
        {data.status === "loaded" && data.value.kind === "not_found" ? (
          <EmptyState
            icon={<FileSearch />}
            title="No encontramos ese comprobante"
            variant="blank"
          />
        ) : null}
        {data.status === "loaded" && data.value.kind === "found" ? (
          <DocumentDetail document={data.value.document} />
        ) : null}
      </div>
    </Modal>
  );
}

export function IssuedFiscalDocumentDetailModal(props: IssuedFiscalDocumentDetailModalProps) {
  const { voucher } = props;
  return voucher === null ? null : (
    <OpenIssuedFiscalDocumentDetailModal {...props} voucher={voucher} />
  );
}
