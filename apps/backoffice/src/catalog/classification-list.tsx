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
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
              icon={<Search />}
            />
          </div>
          {filters}
          <div className="ml-auto flex items-center gap-3">
            <Button
              variant="primary"
              icon={<Plus />}
              {...(createStatus === undefined ? {} : { dataStatus: createStatus })}
              onPress={onCreate}
            >
              {createLabel}
            </Button>
          </div>
        </div>
        <Table {...props} aria-label={label} />
      </div>
      {children}
    </>
  );
}
