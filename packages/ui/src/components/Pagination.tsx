import { useLayoutEffect, useRef } from "react";
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

// Clamped independently of the buttons' own isDisabled check, so the handler itself can never
// report a page outside 1..pageCount.
function previousPage(currentPage: number): number {
  return Math.max(1, currentPage - 1);
}

function nextPage(currentPage: number, pageCount: number): number {
  return Math.min(pageCount, currentPage + 1);
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
  const pageButtonRefs = useRef(new Map<number, HTMLButtonElement>());

  // Pressing Previous/Next onto the very page that disables it (page 1, or the last page) would
  // otherwise leave a disabled button holding focus, and a disabled element can't hold it: the
  // browser drops focus to the document body, and a keyboard user loses their place. The press
  // handlers below don't know what the caller does with the page they ask for — applied now,
  // applied later, or never — so they only record that some boundary-relevant press happened,
  // never which direction: this effect runs after every render and checks the page the component
  // actually re-rendered with, against whichever boundary that turns out to be, not the specific
  // button that was pressed. That distinction matters: focus can move to the *other* nav button
  // between the press and the disabling (by Tab, not by a press of its own, so it never re-records
  // intent), and it's that button's own boundary the redirect has to match once it disables, not
  // the one that was actually pressed. If the caller never applies any change, nothing here ever
  // becomes disabled, and nothing is moved.
  //
  // The recorded intent alone isn't enough: the caller is free to apply the change long after the
  // press — often in a *later* commit than the one that first reacts to it (a loading flag flips
  // before the page itself does) — or never. The intent has to survive every such intervening
  // render, so it's only cleared once it either fires or is clearly moot: moot the moment focus
  // sits anywhere other than document.body or the two nav buttons themselves (a deliberate move
  // elsewhere, which must never be overridden), and still armed for as long as focus sits on
  // whichever nav button was pressed and that button simply hasn't disabled yet. The browser only
  // ever drops focus to document.body as an immediate, involuntary side effect of disabling the
  // element that currently holds it, never from a deliberate change elsewhere — so that's the one
  // signal that ties the redirect to a real disabling happening right now, not a stale intent
  // resolving arbitrarily later.
  //
  // document.activeElement is document-scoped: it never reaches into a shadow tree or an iframe
  // (it reports their host/frame element instead, per spec), so a nav button rendered inside
  // either would never match previousButtonRef/nextButtonRef and this would treat every render as
  // "moved elsewhere" — deliberately out of scope, since nothing in this design system renders
  // into a shadow root or an iframe today. An ancestor's own tabindex changes none of this: it
  // plays no part in the browser's native disable-triggered blur, which always targets
  // document.body (proven below, both wrapped in such an ancestor and as the default before any
  // focus interaction at all).
  //
  // Surviving intervening renders isn't the same as waiting forever: an intent is only ever owed
  // one real chance. armedAtRef pins the page/pageCount as they stood at press time, so a render
  // that changes neither (a loading flag, an unrelated prop) still counts as "nothing happened
  // yet" and leaves the intent armed, but the first render where either actually differs is
  // treated as the press's own outcome — matched or not — and resolves the intent for good. A
  // later, unrelated change that happens to land on a boundary, after one that didn't, must never
  // inherit a press whose one chance already came and went.
  const pendingBoundaryFocusRef = useRef(false);
  const armedAtRef = useRef({ page: currentPage, pageCount: resolvedPageCount });
  const previousButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    if (!pendingBoundaryFocusRef.current) {
      return;
    }
    const armedAt = armedAtRef.current;
    const somethingChanged =
      armedAt.page !== currentPage || armedAt.pageCount !== resolvedPageCount;
    const active = document.activeElement;
    const onANavButton = active === previousButtonRef.current || active === nextButtonRef.current;
    const focusMovedElsewhere = active !== document.body && !onANavButton;
    if (!somethingChanged && !focusMovedElsewhere) {
      // Still waiting: neither the press's own outcome nor anything else has happened yet.
      return;
    }
    pendingBoundaryFocusRef.current = false;
    if (active === document.body && currentPage <= 1) {
      pageButtonRefs.current.get(1)?.focus();
    } else if (active === document.body && currentPage >= resolvedPageCount) {
      pageButtonRefs.current.get(resolvedPageCount)?.focus();
    }
    // An armed intent left pending across an unmount needs no cleanup of its own: React nulls out
    // previousButtonRef/nextButtonRef/pageButtonRefs as their elements unmount, this effect never
    // runs again for an unmounted component, and there is no longer a button here to redirect
    // focus to even if it did — the browser's own removal-triggered blur to document.body is the
    // entire, correct outcome.
  });

  if (resolvedPageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label={label} className="flex items-center gap-2">
      <AriaButton
        ref={previousButtonRef}
        isDisabled={currentPage <= 1}
        onPress={() => {
          pendingBoundaryFocusRef.current = true;
          armedAtRef.current = { page: currentPage, pageCount: resolvedPageCount };
          onPageChange(previousPage(currentPage));
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
                ref={(element) => {
                  if (element) {
                    pageButtonRefs.current.set(place.page, element);
                  } else {
                    pageButtonRefs.current.delete(place.page);
                  }
                }}
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
        ref={nextButtonRef}
        isDisabled={currentPage >= resolvedPageCount}
        onPress={() => {
          pendingBoundaryFocusRef.current = true;
          armedAtRef.current = { page: currentPage, pageCount: resolvedPageCount };
          onPageChange(nextPage(currentPage, resolvedPageCount));
        }}
        className={navButtonClassName}
      >
        {nextLabel}
      </AriaButton>
    </nav>
  );
}
