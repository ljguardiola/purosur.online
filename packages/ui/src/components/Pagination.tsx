import { Button as AriaButton } from "react-aria-components";

export type PaginationProps = {
  // 1-based, like every page a person sees printed on the page itself.
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  // Names the pagination's own navigation landmark.
  label: string;
  // Builds each page button's accessible name from its number, so the caller's own words (and
  // locale) name it, never a bare digit hardcoded here.
  pageLabel: (page: number) => string;
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

// Previous/Next are never natively disabled: a disabled element can't hold focus, so pressing one
// onto the very page that would disable it (page 1, or the last page) used to drop focus to
// document.body, needing a whole mechanism to find its way back. Instead they stay focusable and
// in the tab order always, aria-disabled marks them unavailable for assistive technology (the
// standard focusable-but-unavailable pattern), and the same dimmed look now follows that
// attribute; activating one at its own boundary is simply a no-op in the press handler. Nothing
// ever gets removed, so focus never moves on its own.
const navButtonClassName =
  "flex h-9 items-center justify-center rounded-md border border-line bg-surface-white px-3 " +
  "text-sm text-ink outline-none data-[hovered]:bg-surface-bone " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong " +
  "aria-disabled:opacity-[0.45]";

const pageButtonClassName =
  "flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

const currentPageClassName = "bg-brand-blue-ui font-bold text-surface-white";
// An inset shadow instead of a real border: a real border on only one of these two class strings
// would make that button's own box 2px wider than the other's, shifting every button's width as
// the current page moves.
const otherPageClassName =
  "shadow-[inset_0_0_0_1px_var(--color-line)] bg-surface-white font-normal text-ink " +
  "data-[hovered]:bg-surface-bone";

// NaN and Infinity would otherwise reach Math.min/Math.max and the window math below as
// themselves (NaN propagates, Infinity never clamps), and a fractional value would render a
// half number or an off-by-one window, so both props are resolved to a safe integer first.
// +Infinity is the one non-finite page that still means something ("go to the end"), so it
// resolves to the last page instead of falling back to page 1 like every other non-finite value.
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

export function Pagination({
  page,
  pageCount,
  onPageChange,
  previousLabel,
  nextLabel,
  label,
  pageLabel,
}: PaginationProps) {
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
        className={navButtonClassName}
      >
        {previousLabel}
      </AriaButton>
      <ul className="flex items-center gap-2">
        {pagePlaces(currentPage, resolvedPageCount).map((place) => (
          <li key={place.key}>
            {place.kind === "ellipsis" ? (
              <span aria-hidden="true" className="px-1 text-sm text-ink-secondary">
                {ELLIPSIS}
              </span>
            ) : (
              <AriaButton
                aria-label={pageLabel(place.page)}
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
        className={navButtonClassName}
      >
        {nextLabel}
      </AriaButton>
    </nav>
  );
}
