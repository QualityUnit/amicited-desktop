import { createPortal } from "react-dom";
import {
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
import {
  createContext,
  useContext,
  useState,
  type ComponentType,
  type ComponentProps,
  type ReactNode,
} from "react";
export type MarketingButtonProps = ComponentProps<"button"> & {
  size?: "xs" | "sm";
  variant?: "header" | "agent" | "default" | "outline" | "secondary" | "link" | "row";
};
type Primitives = {
  Categories?: ComponentType<{
    value: string;
    items: readonly (readonly [string, string])[];
    onChange: (value: string) => void;
  }>;
  SettingsGroup?: ComponentType<ComponentProps<"div">>;
  SettingsRow?: ComponentType<{ title: ReactNode; description?: ReactNode; control?: ReactNode }>;
  Breadcrumb?: ComponentType<{ children: ReactNode }>;
  WorkDisclosure?: ComponentType<{
    label: ReactNode;
    children: ReactNode;
    pending?: boolean | undefined;
    defaultOpen?: boolean | undefined;
  }>;
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
  return <Input {...props} className={props.className} />;
}
export function MarketingTextarea(props: ComponentProps<"textarea">) {
  const { Textarea } = useContext(MarketingUiContext);
  return <Textarea {...props} className={props.className} />;
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
    <header>
      <h2>{title}</h2>
      {subtitle && <p className="am-hint">{subtitle}</p>}
      {actions}
    </header>
  );
}

const icons = {
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
  return target ? (
    createPortal(<span className="am-page-title">{children}</span>, target)
  ) : (
    <h1 className="am-page-title">{children}</h1>
  );
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
    <MarketingWorkDisclosure label={label}>{children}</MarketingWorkDisclosure>
  );
}

export function MarketingWorkDisclosure({
  label,
  children,
  pending,
  defaultOpen = false,
}: {
  label: ReactNode;
  children: ReactNode;
  pending?: boolean | undefined;
  defaultOpen?: boolean | undefined;
}) {
  const { WorkDisclosure } = useContext(MarketingUiContext);
  const [open, setOpen] = useState(defaultOpen);
  return WorkDisclosure ? (
    <WorkDisclosure label={label} pending={pending} defaultOpen={defaultOpen}>
      {children}
    </WorkDisclosure>
  ) : (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight size={14} />
        <span>{label}</span>
      </button>
      {open && children}
    </div>
  );
}

export function MarketingSettingsGroup(props: ComponentProps<"div">) {
  const { SettingsGroup } = useContext(MarketingUiContext);
  return SettingsGroup ? <SettingsGroup {...props} /> : <div {...props} />;
}
export function MarketingSettingsRow(props: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
}) {
  const { SettingsRow } = useContext(MarketingUiContext);
  return SettingsRow ? (
    <SettingsRow {...props} />
  ) : (
    <div className="am-setting-row">
      <div>
        {props.title}
        <p>{props.description}</p>
      </div>
      {props.control}
    </div>
  );
}
