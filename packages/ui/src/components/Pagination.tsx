import { Button as AriaButton } from "react-aria-components";

export type PaginationProps = {
  // 1-based, not 0-based.
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label: string;
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

// aria-disabled, not native disabled, so Previous/Next stay focusable at their own boundary; the
// 0.65 opacity keeps the label at or above WCAG AA 4.5:1. react-aria still reports data-[hovered]
// on an aria-disabled button, so the hover background is only in the non-disabled class string.
function navButtonClassName(disabled: boolean): string {
  return [
    "flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3",
    "text-sm text-text outline-none",
    "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid",
    "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-focus",
    disabled ? "opacity-[0.65]" : "data-[hovered]:bg-surface-subtle",
  ].join(" ");
}

const pageButtonClassName =
  "flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-focus";

// cursor-default, not aria-disabled: the current page is still present, just non-actionable, and
// aria-disabled would announce it as unavailable instead.
const currentPageClassName = "cursor-default bg-action font-bold text-text-inverse";
// An inset shadow instead of a real border: a real border on only one of these two class strings
// would make that button's own box 2px wider than the other's, shifting every button's width as
// the current page moves.
const otherPageClassName =
  "shadow-[inset_0_0_0_1px_var(--color-border)] bg-surface font-normal text-text " +
  "data-[hovered]:bg-surface-subtle";

// NaN propagates through Math.min/Math.max and Infinity never clamps, so both props are resolved
// to a safe integer first. +Infinity is the one non-finite page that still means something ("go
// to the end"), so it resolves to the last page instead of falling back to page 1.
function resolvePageCount(pageCount: number): number {
  return Number.isFinite(pageCount) ? Math.trunc(pageCount) : 0;
}

function resolvePage(page: number, pageCount: number): number {
  if (page === Number.POSITIVE_INFINITY) {
    return pageCount;
  }
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(page), 1), pageCount);
}

export function Pagination({ page, pageCount, onPageChange, label }: PaginationProps) {
  const resolvedPageCount = resolvePageCount(pageCount);
  const currentPage = resolvePage(page, resolvedPageCount);

  if (resolvedPageCount <= 1) {
    return null;
  }

  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= resolvedPageCount;

  return (
    <nav aria-label={label} className="flex items-center gap-2">
      <AriaButton
        {...(isFirstPage ? { "aria-disabled": true as const } : {})}
        onPress={() => {
          if (!isFirstPage) {
            onPageChange(currentPage - 1);
          }
        }}
        className={navButtonClassName(isFirstPage)}
      >
        Anterior
      </AriaButton>
      <ul className="flex items-center gap-2">
        {pagePlaces(currentPage, resolvedPageCount).map((place) => (
          <li key={place.key} aria-hidden={place.kind === "ellipsis" ? true : undefined}>
            {place.kind === "ellipsis" ? (
              <span className="px-1 text-sm text-text-subtle">{ELLIPSIS}</span>
            ) : (
              <AriaButton
                aria-label={`Página ${place.page}`}
                {...(place.page === currentPage ? { "aria-current": "page" as const } : {})}
                onPress={() => {
                  if (place.page !== currentPage) {
                    onPageChange(place.page);
                  }
                }}
                className={[
                  pageButtonClassName,
                  place.page === currentPage ? currentPageClassName : otherPageClassName,
                ].join(" ")}
              >
                {place.page}
              </AriaButton>
            )}
          </li>
        ))}
      </ul>
      <AriaButton
        {...(isLastPage ? { "aria-disabled": true as const } : {})}
        onPress={() => {
          if (!isLastPage) {
            onPageChange(currentPage + 1);
          }
        }}
        className={navButtonClassName(isLastPage)}
      >
        Siguiente
      </AriaButton>
    </nav>
  );
}
