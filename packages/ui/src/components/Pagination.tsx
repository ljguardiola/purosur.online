import { Button as AriaButton } from "react-aria-components";

export type PaginationProps = {
  // 1-based, like every page a person sees printed on the page itself.
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
};

const ELLIPSIS = "…";

type PaginationPlace =
  | { key: string; kind: "page"; page: number }
  | { key: string; kind: "ellipsis" };

function pagePlace(page: number): PaginationPlace {
  return { key: `page-${page}`, kind: "page", page };
}

function ellipsisPlace(key: string): PaginationPlace {
  return { key, kind: "ellipsis" };
}

// Always resolves to exactly 5 places once there are more than 5 pages, so the row never reflows
// while paging. Every ellipsis gets its own fixed key, since up to two can appear in the list.
function pagePlaces(page: number, pageCount: number): PaginationPlace[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => pagePlace(index + 1));
  }
  if (page <= 3) {
    return [
      pagePlace(1),
      pagePlace(2),
      pagePlace(3),
      ellipsisPlace("ellipsis-end"),
      pagePlace(pageCount),
    ];
  }
  if (page >= pageCount - 2) {
    return [
      pagePlace(1),
      ellipsisPlace("ellipsis-start"),
      pagePlace(pageCount - 2),
      pagePlace(pageCount - 1),
      pagePlace(pageCount),
    ];
  }
  return [
    pagePlace(1),
    ellipsisPlace("ellipsis-start"),
    pagePlace(page),
    ellipsisPlace("ellipsis-end"),
    pagePlace(pageCount),
  ];
}

const navButtonClassName =
  "flex h-9 items-center justify-center rounded-md border border-line bg-surface-white px-3 " +
  "text-sm text-ink outline-none data-[hovered]:bg-surface-bone " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong " +
  "data-[disabled]:opacity-[0.45]";

const pageButtonClassName =
  "flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

const currentPageClassName = "bg-brand-blue-ui font-bold text-surface-white";
const otherPageClassName =
  "border border-line bg-surface-white font-normal text-ink data-[hovered]:bg-surface-bone";

export function Pagination({
  page,
  pageCount,
  onPageChange,
  previousLabel,
  nextLabel,
}: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <AriaButton
        isDisabled={page <= 1}
        onPress={() => onPageChange(page - 1)}
        className={navButtonClassName}
      >
        {previousLabel}
      </AriaButton>
      <ul className="flex items-center gap-2">
        {pagePlaces(page, pageCount).map((place) => (
          <li key={place.key}>
            {place.kind === "ellipsis" ? (
              <span className="px-1 text-sm text-ink-secondary">{ELLIPSIS}</span>
            ) : (
              <AriaButton
                {...(place.page === page ? { "aria-current": "page" as const } : {})}
                onPress={() => onPageChange(place.page)}
                className={[
                  pageButtonClassName,
                  place.page === page ? currentPageClassName : otherPageClassName,
                ].join(" ")}
              >
                {place.page}
              </AriaButton>
            )}
          </li>
        ))}
      </ul>
      <AriaButton
        isDisabled={page >= pageCount}
        onPress={() => onPageChange(page + 1)}
        className={navButtonClassName}
      >
        {nextLabel}
      </AriaButton>
    </div>
  );
}
