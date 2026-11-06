// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/page-header/PageBreadcrumbs.tsx.
"use client";

import type { ComponentProps } from "react";
const CustomLink = ({
  pathname,
  queryParams: _queryParams,
  ...props
}: ComponentProps<"a"> & {
  pathname: string;
  queryParams?: { [key: string]: string } | undefined;
}) => <a href={pathname} {...props} />;

import type { ReactNode } from "react";
import { Fragment, memo } from "react";
import { Slash as HiSlash } from "lucide-react";
type IconType = never;
import { ArrowLeft as TbArrowLeft } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { HEADER_BUTTON_BASE } from "./headerButtonStyles.js";

const linkClass =
  "hover:text-primary-700 dark:hover:text-primary-200 flex items-center gap-1.5 text-gray-400 transition-colors dark:text-gray-400";
const plainClass = "flex items-center gap-1.5 text-gray-400 dark:text-gray-400";
const ACCESSIBLE_CRUMB = "text-gray-500";
const currentClass = "flex items-center gap-1.5 font-medium text-gray-900 dark:text-white";

export interface PageCrumb {
  label: ReactNode;
  icon?: IconType;
  truncate?: boolean;
  backText?: string;
  href?: string;
  queryParams?: { [key: string]: string };
  onClick?: () => void;
}

const separator = (hidden: string | false) => (
  <li
    aria-hidden="true"
    className={twMerge("flex items-center text-gray-300 select-none dark:text-gray-600", hidden)}
  >
    <HiSlash className="size-3" />
  </li>
);

const LEAF_ONLY_BELOW_LG = "max-lg:hidden";

const nearestLink = (items: PageCrumb[]) =>
  items
    .slice(0, -1)
    .reverse()
    .find((item) => item.href || item.onClick);

const BACK_BUTTON = twMerge(
  HEADER_BUTTON_BASE,
  "w-8 cursor-pointer justify-center border-transparent bg-transparent px-0 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700",
);
const BACK_LINK =
  "hover:text-primary-700 flex w-fit cursor-pointer items-center gap-1 text-[13px] leading-5 text-gray-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:text-gray-400";

const Trail = ({
  items,
  ariaLabel,
  currentAsHeading = false,
  leafOnlyBelowLg = false,
  tone = "default",
  loading = false,
  dataKit,
}: Omit<PageBreadcrumbsProps, "back" | "backLabel">) => {
  const navLabel = ariaLabel ?? "Breadcrumb";
  const accessible = tone === "accessible";
  const linkTone = accessible ? twMerge(linkClass, ACCESSIBLE_CRUMB) : linkClass;
  const plainTone = accessible ? twMerge(plainClass, ACCESSIBLE_CRUMB) : plainClass;
  if (loading) {
    return (
      <nav aria-label={navLabel} aria-busy="true" data-kit={dataKit} className="min-w-0">
        <ol className="flex min-w-0 items-center text-[13px] leading-8">
          <li className="flex items-center">
            <span
              aria-hidden="true"
              className="h-4 w-24 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
            />
          </li>
        </ol>
      </nav>
    );
  }
  return (
    <nav aria-label={navLabel} data-kit={dataKit} className="min-w-0">
      <ol className="flex min-w-0 flex-nowrap items-center gap-x-2 text-[13px] leading-8">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const hidden = leafOnlyBelowLg && LEAF_ONLY_BELOW_LG;
          const Current = currentAsHeading ? "h1" : "span";
          const content =
            isLast || item.truncate ? (
              <span className="min-w-0 truncate">{item.label}</span>
            ) : (
              <span className="whitespace-nowrap">{item.label}</span>
            );

          return (
            <Fragment
              key={
                item.href ?? item.backText ?? (typeof item.label === "string" ? item.label : index)
              }
            >
              {index > 0 && separator(hidden)}
              <li
                className={twMerge(
                  "flex items-center",
                  isLast ? "min-w-0" : "shrink-0",
                  !isLast && hidden,
                  item.truncate && !isLast && "min-w-9 shrink-[100000]",
                )}
              >
                {isLast ? (
                  <Current aria-current="page" className={twMerge(currentClass, "min-w-0")}>
                    {content}
                  </Current>
                ) : item.href ? (
                  <CustomLink
                    pathname={item.href}
                    queryParams={item.queryParams}
                    className={twMerge(linkTone, "min-w-0")}
                  >
                    {content}
                  </CustomLink>
                ) : item.onClick ? (
                  <button
                    type="button"
                    onClick={item.onClick}
                    className={twMerge(linkTone, "min-w-0 cursor-pointer")}
                  >
                    {content}
                  </button>
                ) : (
                  <span className={twMerge(plainTone, "min-w-0")}>{content}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

export interface PageBreadcrumbsProps {
  items: PageCrumb[];
  ariaLabel?: string;
  currentAsHeading?: boolean;
  leafOnlyBelowLg?: boolean;
  tone?: "default" | "accessible";
  loading?: boolean;
  dataKit?: string;
  back?: true | "link";
  backLabel?: (page: string) => string;
}

const BackControl = ({
  crumb,
  label,
  variant,
  leafOnly,
}: {
  crumb: PageCrumb;
  label: string;
  variant: true | "link";
  leafOnly: boolean;
}) => {
  const isLink = variant === "link";
  const className = twMerge(isLink ? BACK_LINK : BACK_BUTTON, leafOnly && "lg:hidden");
  const content = (
    <>
      <TbArrowLeft aria-hidden className={isLink ? "size-3.5" : "size-4"} />
      {isLink ? <span>{label}</span> : null}
    </>
  );
  return crumb.href ? (
    <CustomLink
      pathname={crumb.href}
      queryParams={crumb.queryParams}
      className={className}
      aria-label={isLink ? undefined : label}
    >
      {content}
    </CustomLink>
  ) : (
    <button
      type="button"
      onClick={crumb.onClick}
      aria-label={isLink ? undefined : label}
      className={className}
    >
      {content}
    </button>
  );
};

const PageBreadcrumbsBase = ({ back, backLabel, ...trail }: PageBreadcrumbsProps) => {
  const target = back && backLabel ? nearestLink(trail.items) : undefined;
  const page = target?.backText ?? (typeof target?.label === "string" ? target.label : undefined);
  if (!back || !backLabel || !target || !page) return <Trail {...trail} />;
  const label = backLabel(page);
  const link = back === "link";
  return (
    <div className={twMerge("flex min-w-0", link ? "flex-col items-start" : "items-center gap-1")}>
      <BackControl crumb={target} label={label} variant={back} leafOnly={!!trail.leafOnlyBelowLg} />
      <Trail {...trail} />
    </div>
  );
};

export const PageBreadcrumbs = memo(PageBreadcrumbsBase);
