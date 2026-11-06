import { controlSurface, CONTROL_AREA } from "./cloud/controlSurface.js";
import { KpiCell } from "./cloud/metrics.js";
import { CloudSectionHead } from "./cloud/SectionHead.js";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  ListChecks,
  Wrench,
  Settings,
  PlugZap,
  Globe,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Pencil,
  ArrowRight,
  Plus,
  Bot,
  FileText,
  Search,
  Copy,
  Download,
  Send,
  ShieldCheck,
  Map,
  Share2,
  Braces,
  Gauge,
  Radar,
  PenLine,
  Tag,
  Shapes,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  BookOpen,
  ScanText,
  Repeat2,
  ListFilter,
  MapPin,
} from "lucide-react";
/* oxlint-disable t3code/no-em-dash-copy -- AmICited uses an em dash as its missing-value placeholder. */
import {
  createContext,
  useContext,
  type ComponentType,
  type ComponentProps,
  type ReactNode,
} from "react";
export type MarketingButtonProps = ComponentProps<"button"> & {
  variant?: "agent" | "default" | "outline" | "secondary" | "link" | "row";
};
type Primitives = {
  Menu?: ComponentType<{ label: ReactNode; children: ReactNode }>;
  Tooltip?: ComponentType<{ children: ReactNode; label: string }>;
  Button: ComponentType<MarketingButtonProps>;
  Input: ComponentType<ComponentProps<"input">>;
  Textarea: ComponentType<ComponentProps<"textarea">>;
};
export const MarketingUiContext = createContext<Primitives>({
  Button: ({ variant: _variant, ...props }) => <button {...props} />,
  Input: (props) => <input {...props} />,
  Textarea: (props) => <textarea {...props} />,
});
export function MarketingButton({
  variant = "outline",
  className = "",
  ...props
}: MarketingButtonProps) {
  const { Button } = useContext(MarketingUiContext);
  const header = "data-ask-agent" in props;
  return (
    <Button
      type="submit"
      variant={variant}
      {...props}
      data-marketing-button={header ? "header" : variant}
      className={className}
    />
  );
}
export function MarketingInput(props: ComponentProps<"input">) {
  const { Input } = useContext(MarketingUiContext);
  return <Input {...props} className={`${controlSurface()} my-2 ${props.className ?? ""}`} />;
}
export function MarketingTextarea(props: ComponentProps<"textarea">) {
  const { Textarea } = useContext(MarketingUiContext);
  return (
    <Textarea
      {...props}
      className={`${controlSurface()} ${CONTROL_AREA} my-2 min-h-20 ${props.className ?? ""}`}
    />
  );
}
export function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return <KpiCell label={label} value={value ?? "—"} sub={hint} />;
}
export function SectionHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <CloudSectionHead dense title={title} titleAs="h2" sub={subtitle ?? ""} action={actions} />
  );
}

const icons = {
  Home: LayoutDashboard,
  Tasks: ListChecks,
  Tools: Wrench,
  Settings,
  AmICited: PlugZap,
  website: Globe,
  seo: Gauge,
  chevron: ChevronsUpDown,
  down: ChevronDown,
  right: ChevronRight,
  edit: Pencil,
  arrow: ArrowRight,
  plus: Plus,
  "ai-visibility": Radar,
  content: FileText,
  text: FileText,
  topic: FileText,
  serp: ListFilter,
  search: Search,
  copy: Copy,
  download: Download,
  send: Send,
  brand: Tag,
  category: Shapes,
  market: MapPin,
  assistant: Bot,
  collapse: PanelLeftClose,
  expand: PanelLeftOpen,
  sparkles: Sparkles,
  "seo.ssl.check": ShieldCheck,
  "seo.robots.check": Bot,
  "seo.sitemap.check": Map,
  "seo.llmstxt.check": BookOpen,
  "seo.meta.check": Share2,
  "seo.schema.check": Braces,
  "seo.site.audit": Gauge,
  "ai.visibility.check": Radar,
  "content.readability": ScanText,
  "content.citability": ListChecks,
  "content.write": PenLine,
  "content.repurpose": Repeat2,
  "serp.autocomplete": ListFilter,
  "serp.fetch": Search,
} as const;
export type MarketingIconName = keyof typeof icons;
export function toolIcon(name: string): MarketingIconName {
  if (Object.hasOwn(icons, name)) return name as MarketingIconName;
  throw new Error(`Missing marketing icon: ${name}`);
}
export function MarketingIcon({ name }: { name: MarketingIconName }) {
  // Tabler geometry used by the flowhunt2 sidebar and tool groups.
  const paths: Partial<Record<MarketingIconName, ReactNode>> = {
    Home: (
      <>
        <path d="M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1"></path>
        <path d="M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"></path>
        <path d="M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1"></path>
        <path d="M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"></path>
      </>
    ),
    Tasks: (
      <>
        <path d="M9.615 20h-2.615a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8"></path>
        <path d="M14 19l2 2l4 -4"></path>
        <path d="M9 8h4"></path>
        <path d="M9 12h2"></path>
      </>
    ),
    Tools: (
      <>
        <path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"></path>
      </>
    ),
    Settings: (
      <>
        <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"></path>
        <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"></path>
      </>
    ),
    AmICited: (
      <>
        <path d="M7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1 -5 -5l1.5 -1.5"></path>
        <path d="M17 12l-5 -5l1.5 -1.5a3.536 3.536 0 1 1 5 5l-1.5 1.5"></path>
        <path d="M3 21l2.5 -2.5"></path>
        <path d="M18.5 5.5l2.5 -2.5"></path>
        <path d="M10 11l-2 2"></path>
        <path d="M13 14l-2 2"></path>
      </>
    ),
    website: (
      <>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path>
        <path d="M3.6 9h16.8"></path>
        <path d="M3.6 15h16.8"></path>
        <path d="M11.5 3a17 17 0 0 0 0 18"></path>
        <path d="M12.5 3a17 17 0 0 1 0 18"></path>
      </>
    ),
    seo: (
      <>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path>
        <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"></path>
        <path d="M13.41 10.59l2.59 -2.59"></path>
        <path d="M7 12a5 5 0 0 1 5 -5"></path>
      </>
    ),
    content: (
      <>
        <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"></path>
        <path d="M9 9l1 0"></path>
        <path d="M9 13l6 0"></path>
        <path d="M9 17l6 0"></path>
      </>
    ),
    search: (
      <>
        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
        <path d="M21 21l-6 -6" />
      </>
    ),
    serp: (
      <>
        <path d="M11 6h9M11 12h9M12 18h8M4 6h1M4 12h1" />
        <circle cx="5" cy="18" r="2" />
        <path d="M6.5 19.5L8 21" />
      </>
    ),
    "ai-visibility": (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 12l6.5 -6.5" />
      </>
    ),
    sparkles: (
      <>
        <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2M3 12a6 6 0 0 1 6 6a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6M16 5a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2" />
      </>
    ),
    download: (
      <>
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2M7 11l5 5l5 -5M12 4v12" />
      </>
    ),
  };
  if (paths[name])
    return (
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name]}
      </svg>
    );
  const Icon = icons[name];
  return <Icon aria-hidden="true" size={18} strokeWidth={1.5} />;
}
export const MarketingScopeContext = createContext<HTMLElement | null>(null);
export function MarketingScope({ children }: { children: ReactNode }) {
  const target = useContext(MarketingScopeContext);
  const band = <div className="am-scope-filters">{children}</div>;
  return target ? createPortal(band, target) : band;
}
export const MarketingTitleContext = createContext<HTMLElement | null>(null);
export function MarketingTitle({ children }: { children: ReactNode }) {
  const target = useContext(MarketingTitleContext);
  return target ? createPortal(<span className="am-page-title">{children}</span>, target) : null;
}

export const MarketingToolbarContext = createContext<HTMLElement | null>(null);
export function MarketingToolbar({ children }: { children: ReactNode }) {
  const target = useContext(MarketingToolbarContext);
  const actions = <div className="am-actions">{children}</div>;
  return target ? createPortal(actions, target) : actions;
}

export function MarketingTooltip({
  children,
  label,
  enabled = true,
}: {
  children: ReactNode;
  label: string;
  enabled?: boolean;
}) {
  const { Tooltip } = useContext(MarketingUiContext);
  return Tooltip && enabled ? <Tooltip label={label}>{children}</Tooltip> : children;
}

export function MarketingMenu({ label, children }: { label: ReactNode; children: ReactNode }) {
  const { Menu } = useContext(MarketingUiContext);
  return Menu ? (
    <Menu label={label}>{children}</Menu>
  ) : (
    <details>
      <summary>{label}</summary>
      {children}
    </details>
  );
}
