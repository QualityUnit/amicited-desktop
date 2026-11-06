import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeModule from "node:module";
const repo = NodePath.resolve(import.meta.dirname, "../..");
const webRequire = NodeModule.createRequire(NodePath.join(repo, "apps/web/package.json"));
const tailwindRequire = NodeModule.createRequire(webRequire.resolve("@tailwindcss/vite"));
const { compile } = tailwindRequire("@tailwindcss/node");
export async function cloudSpecimens(out) {
  const source = process.env.AMICITED_CLOUD_SOURCE;
  if (!source)
    throw new Error(
      "AMICITED_CLOUD_SOURCE must name the exported flowhunt2 frontend/src directory",
    );
  const deps = process.env.AMICITED_CLOUD_DEPS;
  if (!deps)
    throw new Error(
      "AMICITED_CLOUD_DEPS must name an isolated install of flowbite-react, @floating-ui/react and react-icons",
    );
  const sourceRequire = NodeModule.createRequire(NodePath.join(deps, "package.json"));
  const { build } = sourceRequire("esbuild");
  const metrics = NodePath.join(source, "components/amicited/dashboard/metrics");
  const fixture = `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import {ThemeProvider} from 'flowbite-react';import {customTheme} from '${source}/app/theme.ts';
 import {SideNavRow} from '${source}/components/side-menu/SideNavRow.tsx';
 import {SectionHead,Card} from '${metrics}/ui.tsx';
 import {Text} from '${source}/components/ui/Text.tsx';
 import {TextInput} from '${source}/components/ui/TextInput.tsx';
 import {Button} from '${source}/components/ui/Button.tsx';
 import {DashboardTrendsTabs} from '${metrics}/DashboardTrendsTabs.tsx';
 import {DashboardTrendsLegend} from '${metrics}/DashboardTrendsLegend.tsx';
 import {AgentBannerHeader} from '${source}/components/amicited/ui/AgentBannerHeader.tsx';
 import {StatusNotification} from '${source}/components/amicited/ui/StatusNotification.tsx';
 import {SIGNAL_ROW_CLASS} from '${source}/components/amicited/ui/signalRow.ts';
 import {TabStrip} from '${source}/components/ui/TabStrip.tsx';
 import {Badge} from '${source}/components/ui/Badge.tsx';
 import {HeaderFilterItem} from '${source}/components/amicited/HeaderFilterItem.tsx';
 import {filterTrigger} from '${source}/components/ui/controlSurface.ts';
 const specimens=<ThemeProvider theme={customTheme}><div data-amicited-tokens="" style={{'--font-ai-sans':'Geist','--font-ai-mono':'"Geist Mono"','--font-ai-serif':'Fraunces',fontFamily:'Inter, sans-serif'}}>
 <div data-specimen="banner"><StatusNotification tone="critical" ariaLabel="Attention" label="ATTENTION" open={false} onToggle={()=>{}} expandLabel="Show" collapseLabel="Hide" header={<AgentBannerHeader title="Check completed"/>}>Evidence</StatusNotification></div>
 <div data-specimen="search"><SideNavRow title="Search" iconNode={<svg/>}/></div>
 <div data-specimen="domain"><button className="workspaceDropDown group/item text-ai-ink hover:bg-ai-bg max-lg:border-ai-surf-3 max-lg:bg-ai-surf-hover lg:border-ai-surf-2 flex w-full cursor-pointer items-center gap-2 rounded-[10px] p-1.5 text-left transition-colors focus:outline-hidden max-lg:mb-6 max-lg:border lg:mb-4 lg:border"><span className="bg-ai-bg grid size-6 shrink-0 place-items-center overflow-hidden rounded-[7px]"><svg className="text-ai-ink-3 size-3.5"/></span><span className="flex min-w-0 flex-1 flex-col overflow-hidden"><span className="block truncate text-[13px] leading-tight font-semibold">example.com</span><span className="text-ai-ink-3 hidden truncate text-[11px] font-normal lg:block">Active domain</span></span><svg className="text-ai-ink-4 size-4 shrink-0"/></button></div>
 <div data-specimen="badge"><Badge tone="bad" size="sm">1 · To fix</Badge></div>
 <div data-specimen="finding" className="@container/signals text-body text-ai-ink"><div className={SIGNAL_ROW_CLASS}><Badge tone="bad" size="sm">1 · To fix</Badge><div><strong>Check your site</strong><details><summary className="text-xs font-normal py-0.5 text-ai-ink-3">Why / How</summary></details></div><button>Fix with AI →</button></div></div>
 <div data-specimen="strip"><TabStrip placement="content" tabs={[{key:'seo',title:'Site audit basics',pathname:'/tools'}]} activeKey="seo" ariaLabel="Tools" onTabChange={()=>{}} /></div>
 <div data-specimen="nav"><SideNavRow title="Tasks" iconNode={<svg/>}/></div>
 <div data-specimen="active"><SideNavRow title="Home" active iconNode={<svg/>}/></div>
 <div data-specimen="secondary"><Button>Edit inputs</Button></div>
 <div data-specimen="filter"><HeaderFilterItem active={false} onClear={()=>{}}><button className={filterTrigger('md',false)}>Website example.com</button></HeaderFilterItem></div>
 <div className="text-body">
 <div data-specimen="head"><Card><SectionHead dense titleAs="h2" title="Recent results" sub="A useful check"/></Card></div>
 <div data-specimen="body"><Text role="body" tone="ink-2">A useful check</Text></div>
 <div data-specimen="input"><TextInput defaultValue="https://example.com" placeholder="Website URL"/></div>
 <div data-specimen="primary"><Button variant="primary">Send task</Button></div>
 
 <div data-specimen="link"><Button variant="link">Fix with AI →</Button></div>
 <div data-specimen="trends" className="@container/dashboard mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-3 py-6 text-[var(--ai-ink)] sm:px-7"><Card className="p-0"><DashboardTrendsTabs tabs={[{id:'voice',label:'Share of voice'},{id:'mentions',label:'Brand mentions'},{id:'answers',label:'Answers checked'}]} tab="voice" ariaLabel="Visibility" onSelect={()=>{}} tabRefs={{current:{}}} className="@xl/kpi:grid-cols-3" headlines={{voice:{value:'33.3%',caption:'Of supplied brands'},mentions:{value:'1'},answers:{value:'2'}}}/></Card></div>
 <div data-specimen="legend" className="@container/dashboard mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-3 py-6 text-[var(--ai-ink)] sm:px-7"><Card className="p-0"><DashboardTrendsLegend layout="dashboard" title="Top brands" valueLabel="Share" items={[{key:'Acme',label:'Acme',domain:'',you:false,color:'#3b5cff',value:'33.3%'}]}/></Card></div>
 
 </div></div></ThemeProvider>;
 export const html=renderToStaticMarkup(specimens);`;
  const stubs = {
    useCopyToClipboard: `export default ()=>({copyToClipboard:()=>{},isCopied:false});`,
    "./charts": `export {HBar} from '${metrics}/charts/HBar.tsx';`,
    "./theme": `export const fmtDelta=x=>String(x);`,
    CustomLink: `import React from 'react';export default ({children,pathname,queryParams,workspaceId,...props})=><a href={pathname} {...props}>{children}</a>;`,
    CustomTooltip: `export default ({children})=>children;`,
    SideMenuTooltip: `export default ({children})=>children;`,
    ComingSoonBadge: `export default ()=>null;`,
    backdropActiveSlice: `export const setBackDropActive=()=>({type:'noop'});`,
    sidebarExpanseSlice: `export const setSidebarExpanded=()=>({type:'noop'});`,
    "@/stores/hooks": `export const useAppDispatch=()=>()=>{};`,
    SideMenuCollapseContext: `export const useSideMenuCollapsed=()=>false;`,

    cardMaximize: `import React from 'react';export const CardMaximizeProvider=({children})=>children;export const useMaximizableCard=()=>({context:null,placeholder:null,ref:null,style:undefined});`,
    "next-intl": `export const useTranslations=()=>key=>({'dashboard.metrics.you':'you','dashboard.metrics.noCompetitorData':'No competitor data'}[key]??key);`,
    "next/font/google": `export const Geist=()=>({variable:''});export const Geist_Mono=()=>({variable:''});`,
    "next/font/local": `export default ()=>({variable:''});`,
    linkContract: `import {useRef} from 'react';export const DisabledReason=()=>null;export const FOCUS_RING='';export const ARIA_DISABLED='';export const linkTarget=()=>null;export const useKeepFocus=()=>({ref:useRef(null)});export const disabledReasonProps=()=>({});`,
    disabledReasonContext: `export const useDisabledReason=x=>x;`,
    Tooltip: `export const Tooltip=({children})=>children;`,
  };
  await build({
    stdin: { contents: fixture, resolveDir: source, loader: "tsx" },
    outfile: NodePath.join(out, "cloud-specimens.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    plugins: [
      {
        name: "cloud-source",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) => {
            if (NodeModule.isBuiltin(args.path)) return { path: args.path, external: true };
            const name = Object.keys(stubs).find(
              (key) => args.path === key || args.path.endsWith("/" + key),
            );
            if (name) return { path: name, namespace: "cloud-adapter" };
            if (args.path.startsWith("@/"))
              return {
                path:
                  NodePath.join(source, args.path.slice(2)) +
                  (/\.[a-z]+$/.test(args.path)
                    ? ""
                    : fsPathExtension(NodePath.join(source, args.path.slice(2)))),
              };
            if (!args.path.startsWith(".") && !NodePath.isAbsolute(args.path)) {
              try {
                return {
                  path:
                    args.path === "react" ||
                    args.path.startsWith("react/") ||
                    args.path.startsWith("react-dom")
                      ? webRequire.resolve(args.path)
                      : sourceRequire.resolve(args.path),
                };
              } catch {
                try {
                  return { path: webRequire.resolve(args.path) };
                } catch {}
              }
            }
          });
          b.onLoad({ filter: /.*/, namespace: "cloud-adapter" }, (args) => ({
            contents: stubs[args.path],
            loader: "tsx",
            resolveDir: source,
          }));
        },
      },
    ],
  });
  const { html } = NodeModule.createRequire(import.meta.url)(
    NodePath.join(out, "cloud-specimens.cjs"),
  );
  const raw = await Promise.all(
    ["tailwindShared.css", "uiTokens.css", "amicitedTokens.css"].map((file) =>
      NodeFSP.readFile(NodePath.join(source, "styles", file), "utf8"),
    ),
  );
  const fonts = await NodeFSP.readFile(
    NodePath.join(repo, "packages/amicited-ui/src/marketing.css"),
    "utf8",
  );
  const faces = fonts
    .slice(fonts.indexOf("@font-face"), fonts.indexOf("@layer components"))
    .replaceAll(
      /url\("\.\/fonts\/([^"]+)"\)/g,
      (_, file) =>
        `url("data:${file.endsWith(".ttf") ? "font/ttf" : "font/woff2"};base64,${fontBytes(file)}")`,
    );
  const cssSource = `@import "${webRequire.resolve("tailwindcss/index.css")}";\n${raw.join("\n")}\n${faces}`;
  const compiled = await compile(cssSource, { base: source, onDependency: () => {} });
  const sourceFiles = await allSource(source);
  const candidates = new Set(
    (html + " " + sourceFiles.join(" ")).split(/[\s"'`<>]+/).filter(Boolean),
  );
  const css =
    compiled.build([...candidates]) +
    "\n*,*::before,*::after{transition:none!important;animation:none!important}";
  await NodeFSP.writeFile(
    NodePath.join(out, "cloud-specimens.html"),
    `<!doctype html><style>${css}</style>${html}`,
  );
  return `<!doctype html><style>${css}</style>${html}`;
}
import * as NodeFS from "node:fs";
function fsPathExtension(file) {
  return (
    [".tsx", ".ts", "/index.tsx", "/index.ts"].find((ext) => NodeFS.existsSync(file + ext)) ?? ""
  );
}
function fontBytes(file) {
  return NodeFS.readFileSync(NodePath.join(repo, "packages/amicited-ui/src/fonts", file)).toString(
    "base64",
  );
}
async function allSource(dir) {
  const entries = await NodeFSP.readdir(dir, { withFileTypes: true });
  const result = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? allSource(NodePath.join(dir, entry.name))
        : /\.(tsx?|css)$/.test(entry.name)
          ? NodeFSP.readFile(NodePath.join(dir, entry.name), "utf8")
          : [],
    ),
  );
  return result.flat();
}
