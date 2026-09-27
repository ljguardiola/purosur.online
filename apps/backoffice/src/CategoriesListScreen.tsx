import {
  Button,
  InlineNotice,
  Modal,
  plural,
  SearchField,
  Select,
  type SelectOption,
  Table,
  type TableSort,
  TextField,
} from "@purosur/ui";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CategorySummary,
  createCategory,
  editCategory,
  fetchCategories,
} from "./categoriesApi";
import { categoryNameError } from "./categoryName";
import { categoriesInTreeOrder, categoryPathLabels, selfAndDescendantIds } from "./categoryPath";
import { ScreenLayout } from "./ScreenLayout";
import { sendToMyAccount } from "./settingsRoutes";
import { useLatestRef } from "./useLatestRef";

export type CategoriesListScreenServices = {
  fetchCategories: typeof fetchCategories;
  createCategory: typeof createCategory;
  editCategory: typeof editCategory;
};

export const defaultCategoriesListScreenServices: CategoriesListScreenServices = {
  fetchCategories,
  createCategory,
  editCategory,
};

export type CategoriesListScreenProps = {
  onSessionEnded: () => void;
  services?: CategoriesListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; categories: CategorySummary[] };

const HEADING = "Categorías";
const RETRY_LABEL = "Reintentar";
const RATE_LIMITED_TITLE = "Demasiadas solicitudes";
const CANCEL_LABEL = "Cancelar";
const CATEGORY_NAME_REQUIRED = "Ingresá el nombre de la categoría.";
const CATEGORY_NAME_TAKEN = "Ya existe una categoría con este nombre.";
const CATEGORY_PARENT_LABEL = "Categoría superior";
const CATEGORY_PARENT_NONE_OPTION = "Ninguna (categoría de primer nivel)";
const CATEGORY_PARENT_HINT = "Opcional. Vacío para una categoría de primer nivel.";
const CATEGORY_PARENT_NOT_FOUND_ERROR = "La categoría superior elegida ya no existe.";

function rateLimitedDetail(params: { minutes: number }): string {
  return `Se puede volver a intentar en ${plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`;
}

function nameTakenUnderParentError(params: { name: string; parent: string }): string {
  return `Ya existe una categoría "${params.name}" en ${params.parent}.`;
}

function parentSelectOptions(
  categories: CategorySummary[],
  excludeIds: ReadonlySet<string>,
  noneLabel: string,
): [SelectOption<string>, ...SelectOption<string>[]] {
  const labels = categoryPathLabels(categories);
  const sorted = categoriesInTreeOrder(categories, "ascending").filter(
    (category) => !excludeIds.has(category.id),
  );
  const noneOption: SelectOption<string> = { value: "", label: noneLabel };
  return [
    noneOption,
    ...sorted.map((category) => ({
      value: category.id,
      label: labels.get(category.id) ?? category.name,
    })),
  ];
}

type NewCategoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (category: CategorySummary) => void;
  onSessionEnded: () => void;
  createCategory: typeof createCategory;
  categories: CategorySummary[];
};

const NO_PARENT_VALUE = "";

function NewCategoryModal({
  isOpen,
  onClose,
  onCreated,
  onSessionEnded,
  createCategory,
  categories,
}: NewCategoryModalProps) {
  const [name, setName] = useState("");
  const [parentValue, setParentValue] = useState(NO_PARENT_VALUE);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [parentError, setParentError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setParentValue(NO_PARENT_VALUE);
      setNameError(undefined);
      setParentError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  const parentOptions = parentSelectOptions(categories, new Set(), CATEGORY_PARENT_NONE_OPTION);
  const parentId = parentValue === NO_PARENT_VALUE ? null : parentValue;
  const parentName = categories.find((category) => category.id === parentValue)?.name ?? "";

  async function handleSubmit() {
    const trimmed = name.trim();
    const invalidName = categoryNameError(name);
    if (invalidName) {
      setNameError(invalidName);
      return;
    }
    setNameError(undefined);
    setParentError(undefined);
    setNotice(null);
    setSubmitting(true);

    const outcome = await createCategory({ name: trimmed, parentId });
    if (outcome.kind === "ok") {
      onCreated(outcome.value);
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
      setNameError(
        parentId === null
          ? CATEGORY_NAME_TAKEN
          : nameTakenUnderParentError({ name: trimmed, parent: parentName }),
      );
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "parent_has_products") {
      setParentError(
        `"${parentName}" tiene productos asignados. Movelos a otra categoría antes de crear una subcategoría.`,
      );
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      if (outcome.field === "parentId") {
        setParentError(CATEGORY_PARENT_NOT_FOUND_ERROR);
      } else {
        setNameError(CATEGORY_NAME_REQUIRED);
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  return (
    <Modal
      isOpen={isOpen}
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
            isDisabled={submitting}
            onPress={onClose}
          >
            {CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={() => void handleSubmit()}
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
            detail="Probá de nuevo."
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={RATE_LIMITED_TITLE}
            detail={rateLimitedDetail({
              minutes: Math.ceil(notice.retryAfterSeconds / 60),
            })}
          />
        )}
        <TextField
          kind="plain-text"
          label="Nombre de la categoría"
          value={name}
          onChange={(value) => {
            setName(value);
            if (nameError) {
              setNameError(categoryNameError(value));
            }
          }}
          required
          {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
        />
        <Select
          label={CATEGORY_PARENT_LABEL}
          options={parentOptions}
          value={parentValue}
          onChange={(value) => {
            setParentValue(value);
            setParentError(undefined);
          }}
          {...(parentError
            ? { invalid: true, errorMessage: parentError }
            : { helperText: CATEGORY_PARENT_HINT })}
        />
      </div>
    </Modal>
  );
}

type EditCategoryModalProps = {
  target: CategorySummary | null;
  onClose: () => void;
  onSaved: (category: CategorySummary) => void;
  onCategoriesReloaded: (categories: CategorySummary[]) => void;
  onSessionEnded: () => void;
  fetchCategories: typeof fetchCategories;
  editCategory: typeof editCategory;
  categories: CategorySummary[];
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" }
  | { kind: "reloadFailed" };

function EditCategoryModal({
  target,
  onClose,
  onSaved,
  onCategoriesReloaded,
  onSessionEnded,
  fetchCategories,
  editCategory,
  categories,
}: EditCategoryModalProps) {
  const isOpen = target !== null;
  const [name, setName] = useState("");
  const [parentValue, setParentValue] = useState(NO_PARENT_VALUE);
  const [version, setVersion] = useState(1);
  const [title, setTitle] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [parentError, setParentError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const targetRef = useLatestRef(target);

  useEffect(() => {
    if (isOpen && target) {
      setName(target.name);
      setParentValue(target.parentId ?? NO_PARENT_VALUE);
      setVersion(target.version);
      setTitle(target.name);
      setNameError(undefined);
      setParentError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen, target]);

  const excludeIds = target ? selfAndDescendantIds(categories, target.id) : new Set<string>();
  const parentOptions = parentSelectOptions(categories, excludeIds, CATEGORY_PARENT_NONE_OPTION);
  const parentId = parentValue === NO_PARENT_VALUE ? null : parentValue;
  const parentName = categories.find((category) => category.id === parentValue)?.name ?? "";

  async function handleSubmit() {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    const trimmed = name.trim();
    const invalidName = categoryNameError(name);
    if (invalidName) {
      setNameError(invalidName);
      return;
    }
    setNameError(undefined);
    setParentError(undefined);
    setNotice(null);
    setSubmitting(true);

    const outcome = await editCategory(current.id, { name: trimmed, parentId, version });
    if (outcome.kind === "ok") {
      onSaved(outcome.value);
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
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "name_taken") {
      setNameError(
        parentId === null
          ? CATEGORY_NAME_TAKEN
          : nameTakenUnderParentError({ name: trimmed, parent: parentName }),
      );
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "parent_has_products") {
      setParentError(
        `"${parentName}" tiene productos asignados. Movelos a otra categoría antes de convertirla en categoría superior.`,
      );
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "move_not_allowed") {
      setParentError(
        `No se puede mover "${current.name}" bajo "${parentName}": es una de sus subcategorías.`,
      );
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      if (outcome.field === "parentId") {
        setParentError(CATEGORY_PARENT_NOT_FOUND_ERROR);
      } else {
        setNameError(CATEGORY_NAME_REQUIRED);
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  async function handleReload() {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    setSubmitting(true);
    const outcome = await fetchCategories();
    if (outcome.kind === "ok") {
      onCategoriesReloaded(outcome.value);
      const fresh = outcome.value.find((category) => category.id === current.id);
      if (!fresh) {
        setNotice({ kind: "notFound" });
        setSubmitting(false);
        return;
      }
      setName(fresh.name);
      setTitle(fresh.name);
      setParentValue(fresh.parentId ?? NO_PARENT_VALUE);
      setVersion(fresh.version);
      setNameError(undefined);
      setParentError(undefined);
      setNotice(null);
      setSubmitting(false);
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
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
  }

  const offersReload = notice?.kind === "staleVersion" || notice?.kind === "reloadFailed";

  return (
    <Modal
      isOpen={isOpen}
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
            isDisabled={submitting}
            onPress={onClose}
          >
            {CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={() => void handleSubmit()}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      {target && (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el cambio"
              detail="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={RATE_LIMITED_TITLE}
              detail={rateLimitedDetail({
                minutes: Math.ceil(notice.retryAfterSeconds / 60),
              })}
            />
          )}
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta categoría cambió mientras la editabas"
              detail="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta categoría ya no existe"
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron recargar los datos"
              detail="Probá de nuevo."
            />
          )}
          {offersReload && (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              isDisabled={submitting}
              onPress={() => void handleReload()}
            >
              Recargar
            </Button>
          )}
          <TextField
            kind="plain-text"
            label="Nombre de la categoría"
            value={name}
            onChange={(value) => {
              setName(value);
              if (nameError) {
                setNameError(categoryNameError(value));
              }
            }}
            required
            {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
          />
          <Select
            label={CATEGORY_PARENT_LABEL}
            options={parentOptions}
            value={parentValue}
            onChange={(value) => {
              setParentValue(value);
              setParentError(undefined);
            }}
            {...(parentError
              ? { invalid: true, errorMessage: parentError }
              : { helperText: CATEGORY_PARENT_HINT })}
          />
        </div>
      )}
    </Modal>
  );
}

export function CategoriesListScreen({ onSessionEnded, services }: CategoriesListScreenProps) {
  const { fetchCategories, createCategory, editCategory } =
    services ?? defaultCategoriesListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const listRef = useLatestRef(list);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSort<"category">>({
    column: "category",
    direction: "ascending",
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategorySummary | null>(null);
  const onSessionEndedRef = useLatestRef(onSessionEnded);

  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    latestLoad.current += 1;
    const thisLoad = latestLoad.current;
    setList({ kind: "loading" });
    const outcome = await fetchCategories();
    if (thisLoad !== latestLoad.current) {
      return;
    }
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", categories: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchCategories, onSessionEndedRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = list.kind === "loaded" ? list.categories : [];
  const labels = useMemo(() => categoryPathLabels(categories), [categories]);
  const pathLabel = useCallback(
    (category: CategorySummary) => labels.get(category.id) ?? category.name,
    [labels],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const ordered = categoriesInTreeOrder(categories, sort.direction);
    return query
      ? ordered.filter((category) => pathLabel(category).toLowerCase().includes(query))
      : ordered;
  }, [categories, search, sort.direction, pathLabel]);

  const columns = [
    {
      key: "category",
      title: "Categoría",
      sortable: true,
      defaultDirection: "ascending",
      render: pathLabel,
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Acciones",
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
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">Catálogo</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">{HEADING}</h1>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
              Nueva categoría
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {list.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No pudimos abrir las categorías"
              detail="Probá de nuevo en unos minutos."
            />
            <Button variant="secondary" onPress={() => void load()}>
              {RETRY_LABEL}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={RATE_LIMITED_TITLE}
              detail={rateLimitedDetail({ minutes: Math.ceil(list.retryAfterSeconds / 60) })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {RETRY_LABEL}
            </Button>
          </>
        )}
        {(list.kind === "loading" || list.kind === "loaded") && (
          <>
            <div className="w-[26.25rem]">
              <SearchField
                variant="backoffice"
                value={search}
                onChange={setSearch}
                placeholder="Buscar una categoría"
                icon={<Search />}
              />
            </div>
            <Table
              aria-label={HEADING}
              columns={columns}
              sort={sort}
              onSortChange={setSort}
              loading={list.kind === "loading" ? "initial" : false}
              rows={filtered.map((category) => ({ id: category.id, item: category }))}
              empty={
                categories.length === 0
                  ? {
                      icon: <Tags />,
                      title: "Todavía no hay categorías",
                      detail: "Creá la primera para poder darle una a un producto.",
                      tone: "blank",
                    }
                  : {
                      icon: <Search />,
                      title: "Sin resultados",
                      detail: "Probá con otro nombre.",
                      tone: "filtered",
                    }
              }
              footer={
                <p className="text-ink-secondary text-sm">
                  {plural(filtered.length, {
                    one: "1 categoría",
                    other: `${filtered.length} categorías`,
                  })}
                </p>
              }
            />
          </>
        )}
      </ScreenLayout>
      <NewCategoryModal
        isOpen={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={(category) => {
          setNewModalOpen(false);
          const current = listRef.current;
          if (current.kind === "loaded") {
            setList({ kind: "loaded", categories: [...current.categories, category] });
          } else {
            void load();
          }
        }}
        onSessionEnded={onSessionEnded}
        createCategory={createCategory}
        categories={categories}
      />
      <EditCategoryModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(category) => {
          setEditTarget(null);
          setList((current) =>
            current.kind === "loaded"
              ? {
                  kind: "loaded",
                  categories: current.categories.map((existing) =>
                    existing.id === category.id ? category : existing,
                  ),
                }
              : current,
          );
        }}
        onCategoriesReloaded={(categories) => {
          latestLoad.current += 1;
          setList({ kind: "loaded", categories });
        }}
        onSessionEnded={onSessionEnded}
        fetchCategories={fetchCategories}
        editCategory={editCategory}
        categories={categories}
      />
    </>
  );
}
