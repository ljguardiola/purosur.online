import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { mergeProps, mergeRefs } from "react-aria";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
} from "react-aria-components";
import { ReservedWidthLabel } from "../shared/reserved-width-label";

type RouterLinkHandlers = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "onClick" | "onFocus" | "onBlur" | "onMouseEnter" | "onMouseLeave" | "onTouchStart"
>;

export type TabProps = RouterLinkHandlers & {
  value: string;
  label: string;
  href: string;
  isDisabled?: boolean;
  style?: AnchorHTMLAttributes<HTMLAnchorElement>["style"];
  ref?: Ref<HTMLAnchorElement>;
};

export type TabsProps = {
  label: string;
  selectedTab: string;
  tabs: ReactNode;
  children: ReactNode;
};

const tabListClassName =
  "flex w-full overflow-x-auto border-b border-border [scrollbar-width:thin]";

const tabClassName =
  "group -mb-px flex h-control-lg shrink-0 cursor-pointer items-center border-b-2 " +
  "border-transparent px-4 outline-none transition-colors " +
  "data-hovered:bg-surface-subtle data-selected:border-action " +
  "data-focus-visible:focus-ring-tight data-disabled:cursor-default " +
  "data-disabled:opacity-disabled data-disabled:bg-transparent";

// react-aria opens a link tab with a click of its own after it has refused the pointer's click, so
// the router's handlers run after react-aria's: the router then follows only that click, once.
export function Tab({
  value,
  label,
  href,
  isDisabled = false,
  style,
  ref,
  onClick,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  onTouchStart,
}: TabProps) {
  const routerHandlers = { onClick, onFocus, onBlur, onMouseEnter, onMouseLeave, onTouchStart };
  return (
    <AriaTab
      id={value}
      href={href}
      isDisabled={isDisabled}
      className={tabClassName}
      render={(domProps) =>
        "href" in domProps ? (
          <a
            {...mergeProps(domProps, routerHandlers)}
            style={style}
            ref={mergeRefs(domProps.ref, ref)}
          />
        ) : (
          <div {...domProps} />
        )
      }
    >
      <ReservedWidthLabel label={label} />
    </AriaTab>
  );
}

export function Tabs({ label, selectedTab, tabs, children }: TabsProps) {
  return (
    <AriaTabs selectedKey={selectedTab} keyboardActivation="manual" className="flex flex-col">
      <AriaTabList aria-label={label} className={tabListClassName}>
        {tabs}
      </AriaTabList>
      <AriaTabPanel id={selectedTab} className="outline-none">
        {children}
      </AriaTabPanel>
    </AriaTabs>
  );
}
