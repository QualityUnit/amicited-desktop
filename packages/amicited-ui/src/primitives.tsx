import { controlSurface, CONTROL_AREA } from "./cloud/controlSurface.js";
import {
  BUTTON_BASE,
  CONTROL_MD,
  KITPRIMARY,
  KITSECONDARY,
  KITGHOST,
} from "./cloud/buttonStyles.js";
import { KpiCell } from "./cloud/metrics.js";
import { CloudSectionHead } from "./cloud/SectionHead.js";
import { HEADER_BUTTON_BASE, HEADER_BUTTON_INACTIVE } from "./cloud/headerButtonStyles.js";
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
  variant?: "default" | "outline" | "secondary" | "link";
};
type Primitives = {
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
  const header = "data-ask-agent" in props;
  return (
    <button
      {...props}
      data-slot="button"
      className={`${header ? `${HEADER_BUTTON_BASE} ${HEADER_BUTTON_INACTIVE}` : `${BUTTON_BASE} ${CONTROL_MD} ${variant === "default" ? KITPRIMARY : variant === "link" ? KITGHOST : KITSECONDARY}`} ${className}`}
    />
  );
}
export function MarketingInput(props: ComponentProps<"input">) {
  return <input {...props} className={`${controlSurface()} my-2 ${props.className ?? ""}`} />;
}
export function MarketingTextarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
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
  return <CloudSectionHead title={title} titleAs="h2" sub={subtitle ?? ""} action={actions} />;
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
  serp: Search,
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
  const Icon = icons[name];
  return <Icon aria-hidden="true" size={18} strokeWidth={2} />;
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
