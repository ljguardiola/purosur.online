import { CATEGORY_NAME_MAX_LENGTH, categoryNameLength } from "@purosur/contracts";
import {
  Button,
  InlineNotice,
  Modal,
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
import { categoryPathLabels, selfAndDescendantIds, sortedByPathLabel } from "./categoryPath";
import { messages } from "./messages";
import { ScreenLayout } from "./ScreenLayout";
import { sendToMyAccount } from "./settingsRoutes";

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
  /** Injected in tests so the screen doesn't call the real API. */
  services?: CategoriesListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; categories: CategorySummary[] };

const catalogMessages = messages.catalog;
const categoriesMessages = catalogMessages.categories;

function categoryNameError(
  name: string,
  modalMessages: { nameRequired: string; nameTooLong: string },
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return modalMessages.nameRequired;
  }
  if (categoryNameLength(trimmed) > CATEGORY_NAME_MAX_LENGTH) {
    return modalMessages.nameTooLong;
  }
  return undefined;
}

/**
 * Every category the "Categoría superior" select offers, sorted by path label with an empty
 * "Ninguna" option first. `excludeIds` drops a category being edited together with its own
 * descendants: a category can't become its own parent or one of its descendants' (the cloud's
 * own `category_move_not_allowed` rule), so leaving those out of the options makes that case
 * impossible to pick instead of merely rejecting it after the fact.
 */
function parentSelectOptions(
  categories: CategorySummary[],
  excludeIds: ReadonlySet<string>,
  noneLabel: string,
): [SelectOption<string>, ...SelectOption<string>[]] {
  const labels = categoryPathLabels(categories);
  const eligible = categories.filter((category) => !excludeIds.has(category.id));
  const sorted = sortedByPathLabel(eligible, labels, "ascending");
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

/** Creates a catalog category; no passkey step-up. */
function NewCategoryModal({
  isOpen,
  onClose,
  onCreated,
  onSessionEnded,
  createCategory,
  categories,
}: NewCategoryModalProps) {
  const modalMessages = categoriesMessages.newCategoryModal;
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

  const parentOptions = parentSelectOptions(categories, new Set(), modalMessages.parentNoneOption);
  const parentId = parentValue === NO_PARENT_VALUE ? null : parentValue;
  const parentName = categories.find((category) => category.id === parentValue)?.name ?? "";

  async function handleSubmit() {
    const trimmed = name.trim();
    const invalidName = categoryNameError(name, modalMessages);
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
          ? modalMessages.nameTaken
          : modalMessages.nameTakenUnderParent({ name: trimmed, parent: parentName }),
      );
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "parent_has_products") {
      setParentError(modalMessages.parentHasProductsError({ parent: parentName }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      if (outcome.field === "parentId") {
        setParentError(modalMessages.parentNotFoundError);
      } else {
        setNameError(modalMessages.nameRequired);
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
      context={modalMessages.eyebrow}
      title={modalMessages.heading}
      closable
      closeLabel={modalMessages.closeLabel}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {modalMessages.cancel}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={() => void handleSubmit()}
          >
            {modalMessages.submit}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.attemptFailedTitle}
            detail={modalMessages.attemptFailedDetail}
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={modalMessages.rateLimitedTitle}
            detail={modalMessages.rateLimitedDetail({
              minutes: Math.ceil(notice.retryAfterSeconds / 60),
            })}
          />
        )}
        <TextField
          kind="plain-text"
          label={modalMessages.nameLabel}
          value={name}
          onChange={(value) => {
            setName(value);
            if (nameError) {
              setNameError(categoryNameError(value, modalMessages));
            }
          }}
          required
          {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
        />
        <Select
          label={modalMessages.parentLabel}
          options={parentOptions}
          value={parentValue}
          onChange={(value) => {
            setParentValue(value);
            setParentError(undefined);
          }}
          {...(parentError
            ? { invalid: true, errorMessage: parentError }
            : { helperText: modalMessages.parentHint })}
        />
      </div>
    </Modal>
  );
}

type EditCategoryModalProps = {
  target: CategorySummary | null;
  onClose: () => void;
  onSaved: (category: CategorySummary) => void;
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

/** Renames a catalog category, rejecting a save over a newer version; no passkey step-up. */
function EditCategoryModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  fetchCategories,
  editCategory,
  categories,
}: EditCategoryModalProps) {
  const modalMessages = categoriesMessages.editCategoryModal;
  const isOpen = target !== null;
  const [name, setName] = useState("");
  const [parentValue, setParentValue] = useState(NO_PARENT_VALUE);
  const [version, setVersion] = useState(1);
  // The dialog's own title: the category's name as it was when the dialog opened, held here
  // (rather than read straight from `target`) so it stays a non-nullable string without ever
  // falling back to a literal, which the message-catalog lint rule forbids in a title attribute.
  const [title, setTitle] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [parentError, setParentError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const targetRef = useRef(target);
  targetRef.current = target;

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
  const parentOptions = parentSelectOptions(categories, excludeIds, modalMessages.parentNoneOption);
  const parentId = parentValue === NO_PARENT_VALUE ? null : parentValue;
  const parentName = categories.find((category) => category.id === parentValue)?.name ?? "";

  async function handleSubmit() {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    const trimmed = name.trim();
    const invalidName = categoryNameError(name, modalMessages);
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
          ? modalMessages.nameTaken
          : modalMessages.nameTakenUnderParent({ name: trimmed, parent: parentName }),
      );
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "parent_has_products") {
      setParentError(modalMessages.parentHasProductsError({ parent: parentName }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "move_not_allowed") {
      setParentError(
        modalMessages.moveNotAllowedError({ category: current.name, destination: parentName }),
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
        setParentError(modalMessages.parentNotFoundError);
      } else {
        setNameError(modalMessages.nameRequired);
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
      const fresh = outcome.value.find((category) => category.id === current.id);
      if (!fresh) {
        setNotice({ kind: "notFound" });
        setSubmitting(false);
        return;
      }
      setName(fresh.name);
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
      context={modalMessages.eyebrow}
      title={title}
      closable
      closeLabel={modalMessages.closeLabel}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {modalMessages.cancel}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={() => void handleSubmit()}
          >
            {modalMessages.submit}
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
              title={modalMessages.attemptFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={modalMessages.rateLimitedTitle}
              detail={modalMessages.rateLimitedDetail({
                minutes: Math.ceil(notice.retryAfterSeconds / 60),
              })}
            />
          )}
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.staleVersionTitle}
              detail={modalMessages.staleVersionDetail}
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.notFoundTitle}
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.reloadFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
          )}
          {offersReload && (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              isDisabled={submitting}
              onPress={() => void handleReload()}
            >
              {modalMessages.reload}
            </Button>
          )}
          <TextField
            kind="plain-text"
            label={modalMessages.nameLabel}
            value={name}
            onChange={(value) => {
              setName(value);
              if (nameError) {
                setNameError(categoryNameError(value, modalMessages));
              }
            }}
            required
            {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
          />
          <Select
            label={modalMessages.parentLabel}
            options={parentOptions}
            value={parentValue}
            onChange={(value) => {
              setParentValue(value);
              setParentError(undefined);
            }}
            {...(parentError
              ? { invalid: true, errorMessage: parentError }
              : { helperText: modalMessages.parentHint })}
          />
        </div>
      )}
    </Modal>
  );
}

/**
 * "Categorías": the catalog's categories, listed by name, searchable, sortable and editable in
 * place. Gated by `manage_products_and_categories`: App.tsx only ever routes here for someone who
 * holds it, and a `forbidden` read (a role change mid-session) sends the browser to Mi cuenta
 * instead of showing a notice.
 */
export function CategoriesListScreen({ onSessionEnded, services }: CategoriesListScreenProps) {
  const { fetchCategories, createCategory, editCategory } =
    services ?? defaultCategoriesListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const listRef = useRef(list);
  listRef.current = list;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSort<"category">>({
    column: "category",
    direction: "ascending",
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategorySummary | null>(null);
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the list and pull
  // the categories out from under an open modal.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  // Only the latest load may settle the list: an earlier one still in flight would otherwise
  // overwrite it with a stale result.
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
  }, [fetchCategories]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = list.kind === "loaded" ? list.categories : [];
  // Every category's full path label ("Almacén › Untables"), shared by the column, the search
  // and the sort below: sorting on it, ascending, already reproduces the tree order the design
  // draws (see categoryPath.ts's own sortedByPathLabel), so no separate tree-walk is needed here.
  const labels = useMemo(() => categoryPathLabels(categories), [categories]);
  const pathLabel = useCallback(
    (category: CategorySummary) => labels.get(category.id) ?? category.name,
    [labels],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = query
      ? categories.filter((category) => pathLabel(category).toLowerCase().includes(query))
      : categories;
    return sortedByPathLabel(matching, labels, sort.direction);
  }, [categories, search, sort.direction, labels, pathLabel]);

  const columns = [
    {
      key: "category",
      title: categoriesMessages.columns.category,
      sortable: true,
      defaultDirection: "ascending",
      render: pathLabel,
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: categoriesMessages.rowActionsLabel,
      actions: [
        (item: CategorySummary) => ({
          icon: <Pencil />,
          "aria-label": categoriesMessages.editAria({ name: item.name }),
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
              <p className="text-ink-secondary text-sm">{categoriesMessages.breadcrumb}</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">
                {categoriesMessages.heading}
              </h1>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
              {categoriesMessages.newCategoryButton}
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
              title={categoriesMessages.loadErrorTitle}
              detail={categoriesMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {categoriesMessages.retry}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={categoriesMessages.rateLimitedTitle}
              detail={categoriesMessages.rateLimitedDetail({
                minutes: Math.ceil(list.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {categoriesMessages.retry}
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
                placeholder={categoriesMessages.searchPlaceholder}
                icon={<Search />}
              />
            </div>
            <Table
              aria-label={categoriesMessages.heading}
              columns={columns}
              sort={sort}
              onSortChange={setSort}
              loading={list.kind === "loading" ? "initial" : false}
              rows={filtered.map((category) => ({ id: category.id, item: category }))}
              empty={
                categories.length === 0
                  ? {
                      icon: <Tags />,
                      title: categoriesMessages.emptyTitle,
                      detail: categoriesMessages.emptyDetail,
                      tone: "blank",
                    }
                  : {
                      icon: <Search />,
                      title: categoriesMessages.noResultsTitle,
                      detail: categoriesMessages.noResultsDetail,
                      tone: "filtered",
                    }
              }
              footer={
                <p className="text-ink-secondary text-sm">
                  {categoriesMessages.count({ count: filtered.length })}
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
          // Read through a ref: this runs after the create request's await, when `list` from
          // the render that started it may be stale.
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
        onSessionEnded={onSessionEnded}
        fetchCategories={fetchCategories}
        editCategory={editCategory}
        categories={categories}
      />
    </>
  );
}
