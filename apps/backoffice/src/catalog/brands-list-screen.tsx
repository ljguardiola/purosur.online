import { type BrandSummary, brandEditBodySchema } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  formatNumber,
  InlineNotice,
  type ItemOrder,
  ListFilter,
  Modal,
  plural,
  SearchField,
  StatusIndicator,
  Table,
  type TableSort,
  textOrder,
  useRequestForm,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import {
  Ban,
  Check,
  Factory,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  ShieldX,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { brandNameMessage } from "./brand-name";
import type { ChangeBrandActivationOutcome, editBrand } from "./brands-api";
import type { BrandsListScreenServices } from "./brands-list-services";
import {
  type BrandReload,
  useBrandsQuery,
  useRefreshCatalog,
  useReloadBrand,
} from "./catalog-queries";
import { BRAND_NAME_TAKEN, NewBrandModal } from "./new-brand-modal";
import type { BrandsListFilters } from "./routes";

export type BrandsListScreenProps = {
  filters: BrandsListFilters;
  onFiltersChange: (filters: BrandsListFilters) => void;
  onSessionEnded: () => void;
  services: BrandsListScreenServices;
};

type BrandStatusFilter = BrandsListFilters["status"];
type BrandSortColumn = BrandsListFilters["sortBy"];

const NO_BRANDS: BrandSummary[] = [];

const BRAND_STATUS_EMPTY_TITLE = {
  active: "No hay marcas activas",
  inactive: "No hay marcas inactivas",
  all: "Sin resultados",
} satisfies Record<BrandStatusFilter, string>;

const brandNameOrder = textOrder((brand: BrandSummary) => brand.name);

const productCountOrder: ItemOrder<BrandSummary> = (a, b) =>
  a.productCount - b.productCount || brandNameOrder(a, b);

function showsStatus(brand: BrandSummary, status: BrandStatusFilter): boolean {
  return status === "all" || brand.active === (status === "active");
}

function productsText(count: number): string {
  return plural(count, { one: "1 producto", other: `${formatNumber(count)} productos` });
}

function brandsFooterText(brands: BrandSummary[]): string {
  const inactive = brands.filter((brand) => !brand.active).length;
  const products = brands.reduce((sum, brand) => sum + brand.productCount, 0);
  return [
    plural(brands.length, { one: "1 marca", other: `${formatNumber(brands.length)} marcas` }),
    inactive > 0
      ? plural(inactive, { one: "1 inactiva", other: `${formatNumber(inactive)} inactivas` })
      : undefined,
    productsText(products),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

function renameReachText(productCount: number): string | undefined {
  if (productCount === 0) {
    return undefined;
  }
  return plural(productCount, {
    one: "El nombre nuevo se ve en su producto.",
    other: `El nombre nuevo se ve en sus ${formatNumber(productCount)} productos.`,
  });
}

type EditBrandModalProps = {
  target: BrandSummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<BrandReload>;
  editBrand: typeof editBrand;
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" };

function EditBrandModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  editBrand,
}: EditBrandModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [loaded, setLoaded] = useState<BrandSummary | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: { name: "", version: 1 },
    request: {
      schema: brandEditBodySchema,
      from: ({ name, version }) => ({ name: name.trim(), version }),
    },
    fields: { name: "name", version: null },
    messages: { name: brandNameMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await editBrand(target.id, request);
      if (outcome.kind === "ok") {
        onSaved();
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "not_found") {
        setNotice({ kind: "notFound" });
        return;
      }
      if (outcome.kind === "name_taken") {
        showFieldError("name", BRAND_NAME_TAKEN);
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  function load(brand: BrandSummary) {
    reset({ name: brand.name, version: brand.version });
    setLoaded(brand);
    setNotice(null);
  }

  useEffect(() => {
    if (open && target) {
      reset({ name: target.name, version: target.version });
      setLoaded(target);
      setNotice(null);
      setReloading(false);
    }
  }, [open, target, reset]);

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      load(outcome.brand);
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    }
    setReloading(false);
  }

  const reach = loaded ? renameReachText(loaded.productCount) : undefined;

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Pencil />}
      context="Catálogo · Marcas"
      title={loaded?.name ?? ""}
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting || reloading}
            onPress={() => void submit()}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se guardó la marca"
              description="Volvé a intentarlo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta marca cambió mientras la editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice tone="error" icon={<TriangleAlert />} title="Esta marca ya no existe" />
          )}
          {notice?.kind === "staleVersion" ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              disabled={submitting || reloading}
              onPress={() => void handleReload()}
            >
              Recargar
            </Button>
          ) : null}
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Nombre"
                required
                {...(reach === undefined ? {} : { description: reach })}
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}

type ActivationChange = "deactivate" | "reactivate";

const ACTIVATION_TEXTS = {
  deactivate: {
    title: (name: string) => `¿Desactivar la marca "${name}"?`,
    description:
      "Deja de ofrecerse para asignar a un producto nuevo. Los productos que ya la tienen la conservan.",
    confirm: "Desactivar",
    failed: "No se desactivó la marca",
    alreadyChanged: "Ya estaba desactivada",
  },
  reactivate: {
    title: (name: string) => `¿Reactivar la marca "${name}"?`,
    description: "Vuelve a ofrecerse para asignarla a productos nuevos.",
    confirm: "Reactivar",
    failed: "No se reactivó la marca",
    alreadyChanged: "Ya estaba activa",
  },
} satisfies Record<ActivationChange, unknown>;

type ActivationNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyChanged" }
  | { kind: "notFound" };

type BrandActivationModalProps = {
  target: { brand: BrandSummary; change: ActivationChange } | null;
  onClose: () => void;
  onChanged: () => void;
  onSessionEnded: () => void;
  changeActivation: Record<ActivationChange, (id: string) => Promise<ChangeBrandActivationOutcome>>;
};

function BrandActivationModal({
  target,
  onClose,
  onChanged,
  onSessionEnded,
  changeActivation,
}: BrandActivationModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState(target);
  const [notice, setNotice] = useState<ActivationNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && target) {
      setShown(target);
      setNotice(null);
      setSubmitting(false);
    }
  }, [open, target]);

  async function handleConfirm() {
    if (!target) {
      return;
    }
    setNotice(null);
    setSubmitting(true);
    const outcome = await changeActivation[target.change](target.brand.id);
    if (outcome.kind === "ok") {
      onChanged();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    setSubmitting(false);
    if (outcome.kind === "already_changed") {
      setNotice({ kind: "alreadyChanged" });
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setNotice({ kind: "attemptFailed" });
  }

  const change = shown?.change ?? "deactivate";
  const texts = ACTIVATION_TEXTS[change];
  const listOutdated = notice?.kind === "alreadyChanged" || notice?.kind === "notFound";

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="confirmation"
      tone={change === "deactivate" ? "error" : "info"}
      icon={change === "deactivate" ? <Ban /> : <RotateCcw />}
      title={shown ? texts.title(shown.brand.name) : ""}
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          {listOutdated ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={onChanged}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              destructive={change === "deactivate"}
              size="large"
              icon={change === "deactivate" ? <Ban /> : <RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              {texts.confirm}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">{texts.description}</p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={texts.failed}
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "alreadyChanged" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={texts.alreadyChanged} />
        )}
        {notice?.kind === "notFound" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Esta marca ya no existe" />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
      </div>
    </Modal>
  );
}

export function BrandsListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: BrandsListScreenProps) {
  const { fetchBrands, createBrand, editBrand, deactivateBrand, reactivateBrand } = services;
  const data = useBrandsQuery({ fetchBrands, onSessionEnded });
  const refreshCatalog = useRefreshCatalog();
  const reloadBrand = useReloadBrand({ fetchBrands });
  const [search, setSearch] = useState(filters.search);
  const [statusFilter, setStatusFilter] = useState<BrandStatusFilter>(filters.status);
  const [sort, setSort] = useState<TableSort<BrandSortColumn>>({
    column: filters.sortBy,
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BrandSummary | null>(null);
  const [activationTarget, setActivationTarget] = useState<{
    brand: BrandSummary;
    change: ActivationChange;
  } | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: BrandsListFilters = {
      search,
      status: statusFilter,
      sortBy: sort.column,
      sort: sort.direction,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, statusFilter, sort.column, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const brands = data.status === "loaded" ? data.value : NO_BRANDS;

  const statusFilterOptions = [
    { value: "active" as const, label: "Activas" },
    { value: "inactive" as const, label: "Inactivas" },
    { value: "all" as const, label: "Todas" },
  ] as const;

  const columns = [
    dataColumn({
      id: "brand",
      header: "Marca",
      sort: { order: brandNameOrder, firstDirection: "ascending" },
      render: (item: BrandSummary) => item.name,
    }),
    dataColumn({
      id: "products",
      header: "Productos",
      sort: { order: productCountOrder, firstDirection: "descending" },
      render: (item: BrandSummary) => formatNumber(item.productCount),
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: BrandSummary) =>
        item.active ? (
          <StatusIndicator tone="success">Activa</StatusIndicator>
        ) : (
          <StatusIndicator tone="neutral">Inactiva</StatusIndicator>
        ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: BrandSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la marca ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: BrandSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar la marca ${item.name}`,
                onPress: () => setActivationTarget({ brand: item, change: "deactivate" }),
              }
            : {
                icon: <RotateCcw />,
                "aria-label": `Reactivar la marca ${item.name}`,
                onPress: () => setActivationTarget({ brand: item, change: "reactivate" }),
              },
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: brands,
    id: (brand) => brand.id,
    search: { text: search, in: (brand) => [brand.name] },
    filter: (brand) => showsStatus(brand, statusFilter),
    columns,
    sort,
    onSortChange: setSort,
  });
  const matchedBrands = table.getRowModel().rows.map((row) => row.original);

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Marcas</ScreenTitle>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
              Nueva marca
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar una marca"
              icon={<Search />}
            />
          </div>
          <ListFilter
            label="Estado:"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <Table
          aria-label="Marcas"
          table={table}
          {...cloudTableState(data, "las marcas")}
          empty={
            brands.length === 0
              ? {
                  icon: <Factory />,
                  title: "Todavía no hay marcas",
                  description:
                    "Se cargan para identificar el fabricante o la línea comercial de un producto.",
                  variant: "blank",
                }
              : search.trim() === ""
                ? {
                    icon: <SearchX />,
                    title: BRAND_STATUS_EMPTY_TITLE[statusFilter],
                    variant: "filtered",
                  }
                : {
                    icon: <SearchX />,
                    title: "Sin resultados",
                    description: "Probá con otro nombre.",
                    variant: "filtered",
                  }
          }
          footer={
            matchedBrands.length === 0 ? undefined : (
              <p className="text-text-subtle text-detail">{brandsFooterText(matchedBrands)}</p>
            )
          }
        />
      </ScreenLayout>
      <NewBrandModal
        open={newModalOpen}
        context="Catálogo"
        createBrand={createBrand}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshCatalog();
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
      {data.status === "loaded" ? (
        <EditBrandModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshCatalog();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadBrand}
          editBrand={editBrand}
        />
      ) : null}
      <BrandActivationModal
        target={activationTarget}
        onClose={() => setActivationTarget(null)}
        onChanged={() => {
          setActivationTarget(null);
          void refreshCatalog();
        }}
        onSessionEnded={onSessionEnded}
        changeActivation={{ deactivate: deactivateBrand, reactivate: reactivateBrand }}
      />
    </>
  );
}
