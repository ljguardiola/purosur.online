import { Button, type LoadStatus, SearchField, Table, type TableProps } from "@purosur/ui";
import { Plus, Search } from "lucide-react";
import type { ReactNode } from "react";

type WithoutLabel<Props> = Props extends unknown ? Omit<Props, "aria-label"> : never;

export type ClassificationListProps<T extends object> = WithoutLabel<TableProps<T>> & {
  label: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (search: string) => void;
  filters?: ReactNode;
  createLabel: string;
  onCreate: () => void;
  createStatus?: LoadStatus | undefined;
  children?: ReactNode;
};

export function ClassificationList<T extends object>(props: ClassificationListProps<T>) {
  const {
    label,
    searchPlaceholder,
    search,
    onSearchChange,
    filters,
    createLabel,
    onCreate,
    createStatus,
    children,
  } = props;
  return (
    <>
      <section className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-text-accent text-subheading">{label}</h2>
          <Button
            variant="primary"
            icon={<Plus />}
            {...(createStatus === undefined ? {} : { dataStatus: createStatus })}
            onPress={onCreate}
          >
            {createLabel}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <SearchField
              value={search}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
              icon={<Search />}
            />
          </div>
          {filters}
        </div>
        <Table {...props} aria-label={label} fill />
      </section>
      {children}
    </>
  );
}
