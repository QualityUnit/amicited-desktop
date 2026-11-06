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
export function MarketingButton(props: MarketingButtonProps) {
  const { Button } = useContext(MarketingUiContext);
  return <Button {...props} />;
}
export function MarketingInput(props: ComponentProps<"input">) {
  const { Input } = useContext(MarketingUiContext);
  return <Input {...props} />;
}
export function MarketingTextarea(props: ComponentProps<"textarea">) {
  const { Textarea } = useContext(MarketingUiContext);
  return <Textarea {...props} />;
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
  return (
    <div className="am-kpi">
      <div className="am-label">{label}</div>
      <div className="am-figure">{value ?? "—"}</div>
      {hint && <div className="am-hint">{hint}</div>}
    </div>
  );
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
    <div className="am-section-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
