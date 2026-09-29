import {
  type CategorySummary,
  categoryCreationBodySchema,
  categoryEditBodySchema,
} from "@purosur/contracts";
import {
  Button,
  InlineNotice,
  Modal,
  type Option,
  type Options,
  plural,
  SearchField,
  Table,
  type TableSort,
  tableRows,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import {
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldX,
  Tags,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudForm } from "../platform/cloud-form";
import { cloudTableState } from "../platform/cloud-table-state";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  type CategoryReload,
  useCategoriesQuery,
  useRefreshCatalog,
  useReloadCategory,
} from "./catalog-queries";
import type { createCategory, editCategory } from "./categories-api";
import type { CategoriesListScreenServices } from "./categories-list-services";
import { categoryNameMessage } from "./category-name";
import {
  categoriesInTreeOrder,
  categoryNameOrder,
  categoryParentId,
  categoryPathLabels,
  selfAndDescendantIds,
} from "./category-path";
import type { CategoriesListFilters } from "./routes";

export type CategoriesListScreenProps = {
  filters: CategoriesListFilters;
  onFiltersChange: (filters: CategoriesListFilters) => void;
  onSessionEnded: () => void;
  services: CategoriesListScreenServices;
};

const NO_CATEGORIES: CategorySummary[] = [];

const CATEGORY_NAME_TAKEN = "Ya existe una categoría con este nombre.";
const CATEGORY_PARENT_NOT_FOUND_ERROR = "La categoría superior elegida ya no existe.";
const CATEGORY_PARENT_HELPER_TEXT = "Opcional. Vacío para una categoría de primer nivel.";

function nameTakenUnderParentError(params: { name: string; parent: string }): string {
  return `Ya existe una categoría "${params.name}" en ${params.parent}.`;
}

function parentSelectOptions(
  categories: CategorySummary[],
  excludeIds: ReadonlySet<string>,
): Options<Option<string>> {
  const labels = categoryPathLabels(categories);
  const sorted = categoriesInTreeOrder(categories).filter(
    (category) => !excludeIds.has(category.id),
  );
  const noneOption: Option<string> = {
    value: "",
    label: "Ninguna (categoría de primer nivel)",
  };
  return [
    noneOption,
    ...sorted.map((category) => ({
      value: category.id,
      label: labels.get(category.id) ?? category.name,
    })),
  ];
}

type NewCategoryModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSessionEnded: () => void;
  createCategory: typeof createCategory;
  categories: CategorySummary[];
};

const NO_PARENT_VALUE = "";

function parentIdOf(parentValue: string): string | null {
  return parentValue === NO_PARENT_VALUE ? null : parentValue;
}

function categoryName(categories: CategorySummary[], id: string | null | undefined): string {
  return categories.find((category) => category.id === id)?.name ?? "";
}

function NewCategoryModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  createCategory,
  categories,
}: NewCategoryModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: { name: "", parentValue: NO_PARENT_VALUE },
    request: {
      schema: categoryCreationBodySchema,
      from: ({ name, parentValue }) => ({
        name: name.trim(),
        parentId: parentIdOf(parentValue),
      }),
    },
    fields: { name: "name", parentId: "parentValue" },
    messages: { name: categoryNameMessage, parentValue: CATEGORY_PARENT_NOT_FOUND_ERROR },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const parentName = categoryName(categories, request.parentId);
      const outcome = await createCategory({
        name: request.name,
        parentId: request.parentId ?? null,
      });
      if (outcome.kind === "ok") {
        onCreated();
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
      if (outcome.kind === "name_taken") {
        showFieldError(
          "name",
          request.parentId
            ? nameTakenUnderParentError({ name: request.name, parent: parentName })
            : CATEGORY_NAME_TAKEN,
        );
        return;
      }
      if (outcome.kind === "parent_has_products") {
        showFieldError(
          "parentValue",
          `"${parentName}" tiene productos asignados. Movelos a otra categoría antes de crear una subcategoría.`,
        );
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

  useEffect(() => {
    if (open) {
      reset();
      setNotice(null);
    }
  }, [open, reset]);

  const parentOptions = parentSelectOptions(categories, new Set());

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
      icon={<Tags />}
      context="Catálogo"
      title="Nueva categoría"
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
            disabled={submitting}
            onPress={() => void submit()}
          >
            Crear la categoría
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo crear la categoría"
            description="Probá de nuevo."
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
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre de la categoría" required />}
        </form.AppField>
        <form.AppField name="parentValue">
          {(field) => (
            <field.Select
              label="Categoría superior"
              options={parentOptions}
              description={CATEGORY_PARENT_HELPER_TEXT}
            />
          )}
        </form.AppField>
      </div>
    </Modal>
  );
}

type EditCategoryModalProps = {
  target: CategorySummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<CategoryReload>;
  editCategory: typeof editCategory;
  categories: CategorySummary[];
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" };

function categoryFormValues(category: CategorySummary) {
  return {
    name: category.name,
    parentValue: category.parentId ?? NO_PARENT_VALUE,
    version: category.version,
  };
}

function EditCategoryModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  editCategory,
  categories,
}: EditCategoryModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: { name: "", parentValue: NO_PARENT_VALUE, version: 1 },
    request: {
      schema: categoryEditBodySchema,
      from: ({ name, parentValue, version }) => ({
        name: name.trim(),
        parentId: parentIdOf(parentValue),
        version,
      }),
    },
    fields: { name: "name", parentId: "parentValue", version: null },
    messages: { name: categoryNameMessage, parentValue: CATEGORY_PARENT_NOT_FOUND_ERROR },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const parentName = categoryName(categories, request.parentId);
      const outcome = await editCategory(target.id, request);
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
        showFieldError(
          "name",
          request.parentId
            ? nameTakenUnderParentError({ name: request.name, parent: parentName })
            : CATEGORY_NAME_TAKEN,
        );
        return;
      }
      if (outcome.kind === "parent_has_products") {
        showFieldError(
          "parentValue",
          `"${parentName}" tiene productos asignados. Movelos a otra categoría antes de convertirla en categoría superior.`,
        );
        return;
      }
      if (outcome.kind === "move_not_allowed") {
        showFieldError(
          "parentValue",
          `No se puede mover "${target.name}" bajo "${parentName}": es una de sus subcategorías.`,
        );
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

  useEffect(() => {
    if (open && target) {
      reset(categoryFormValues(target));
      setTitle(target.name);
      setNotice(null);
      setReloading(false);
    }
  }, [open, target, reset]);

  const excludeIds = target ? selfAndDescendantIds(categories, target.id) : new Set<string>();
  const parentOptions = parentSelectOptions(categories, excludeIds);

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      reset(categoryFormValues(outcome.category));
      setTitle(outcome.category.name);
      setNotice(null);
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    }
    setReloading(false);
  }

  const offersReload = notice?.kind === "staleVersion";

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
      icon={<Tags />}
      context="Catálogo · Categorías"
      title={title}
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
              title="No se pudo guardar el cambio"
              description="Probá de nuevo."
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
              title="Esta categoría cambió mientras la editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta categoría ya no existe"
            />
          )}
          {offersReload ? (
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
              <field.TextField kind="plain-text" label="Nombre de la categoría" required />
            )}
          </form.AppField>
          <form.AppField name="parentValue">
            {(field) => (
              <field.Select
                label="Categoría superior"
                options={parentOptions}
                description={CATEGORY_PARENT_HELPER_TEXT}
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}

export function CategoriesListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: CategoriesListScreenProps) {
  const { fetchCategories, createCategory, editCategory } = services;
  const data = useCategoriesQuery({ fetchCategories, onSessionEnded });
  const refreshCatalog = useRefreshCatalog();
  const reloadCategory = useReloadCategory({ fetchCategories });
  const [search, setSearch] = useState(filters.search);
  const [sort, setSort] = useState<TableSort<"category">>({
    column: "category",
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategorySummary | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: CategoriesListFilters = { search, sort: sort.direction };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const categories = data.status === "loaded" ? data.value : NO_CATEGORIES;
  const labels = categoryPathLabels(categories);
  const pathLabel = (category: CategorySummary) => labels.get(category.id) ?? category.name;
  const { rows, matchCount } = tableRows({
    items: categories,
    id: (category) => category.id,
    search: { text: search, in: (category) => [pathLabel(category)] },
    sort: {
      by: sort,
      orders: { category: categoryNameOrder },
      parentId: categoryParentId,
    },
  });

  const columns = [
    {
      key: "category",
      header: "Categoría",
      sortable: true,
      defaultDirection: "ascending",
      render: pathLabel,
    },
    {
      key: "actions",
      kind: "actions",
      header: "Acciones",
      actions: [
        (item: CategorySummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la categoría ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
      ],
    },
  ] as const;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Categorías</ScreenTitle>
            </div>
            <Button
              variant="primary"
              icon={<Plus />}
              dataStatus={data.status}
              onPress={() => setNewModalOpen(true)}
            >
              Nueva categoría
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="w-105">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar una categoría"
            icon={<Search />}
          />
        </div>
        <Table
          aria-label="Categorías"
          columns={columns}
          sort={sort}
          onSortChange={setSort}
          {...cloudTableState(data, "las categorías")}
          rows={rows}
          empty={
            categories.length === 0
              ? {
                  icon: <Tags />,
                  title: "Todavía no hay categorías",
                  description: "Creá la primera para poder darle una a un producto.",
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(matchCount, {
                  one: "1 categoría",
                  other: `${matchCount} categorías`,
                })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewCategoryModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshCatalog();
        }}
        onSessionEnded={onSessionEnded}
        createCategory={createCategory}
        categories={categories}
      />
      {data.status === "loaded" ? (
        <EditCategoryModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshCatalog();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadCategory}
          editCategory={editCategory}
          categories={data.value}
        />
      ) : null}
    </>
  );
}
