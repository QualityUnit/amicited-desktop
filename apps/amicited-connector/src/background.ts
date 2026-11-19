// @effect-diagnostics globalTimers:off - The extension runs in the browser, outside any Effect runtime.
import {
  bridgePath,
  defaultBridgePort,
  type BridgeRequest,
  type ConnectorMessage,
} from "@amicited/visibility/bridge";
import { pageScripts } from "@amicited/visibility/scripts";
import { ext, type Tab } from "./extension.ts";

const origin = `http://127.0.0.1:${defaultBridgePort}`;
/** Tabs this extension opened or took over; it never touches the user's other tabs. */
const owned = new Set<number>();
/** Windows left blank after a check, closed unless another check reuses them soon. */
const idle = new Map<number, ReturnType<typeof setTimeout>>();
let socket: WebSocket | null = null;

async function browserInfo() {
  const info = await ext.runtime.getBrowserInfo?.();
  if (info) return { name: info.name, version: info.version };
  const brands =
    (navigator as { userAgentData?: { brands: { brand: string; version: string }[] } })
      .userAgentData?.brands ?? [];
  const brand =
    brands.find((b) => !/not.?a.?brand|chromium/i.test(b.brand)) ??
    brands.find((b) => /chromium/i.test(b.brand));
  return brand ? { name: brand.brand, version: brand.version } : { name: "Chromium", version: "" };
}

function send(message: ConnectorMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const ws = new WebSocket(`ws://127.0.0.1:${defaultBridgePort}${bridgePath}`);
  socket = ws;
  ws.onopen = async () =>
    send({
      type: "hello",
      extensionVersion: ext.runtime.getManifest().version,
      browser: await browserInfo(),
      scripts: [...pageScripts().keys()],
    });
  ws.onmessage = (event) => void handle(JSON.parse(String(event.data)) as BridgeRequest);
  ws.onclose = () => {
    if (socket === ws) socket = null;
  };
}

/** Resolves when the tab finishes loading; register before navigating so the event is not missed. */
function loaded(tabId: number, timeoutMs: number, url: string) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      ext.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    // A blank tab reports its own load late; that must not end the wait for the next page.
    const listener = (id: number, change: { readonly status?: string }, tab?: Tab) => {
      if (id !== tabId || change.status !== "complete") return;
      if (url === "about:blank" || tab?.url !== "about:blank") done();
    };
    // A page that never reports complete is still usable once parsed; the engine checks the DOM.
    const timer = setTimeout(done, timeoutMs);
    ext.tabs.onUpdated.addListener(listener);
  });
}
async function navigate(tabId: number, url: string, timeoutMs: number, active?: boolean) {
  const ready = loaded(tabId, timeoutMs, url);
  const tab = await ext.tabs.update(tabId, active === undefined ? { url } : { url, active });
  await ready;
  return tab;
}

async function open(url: string, focus: boolean) {
  const [landing] = await ext.tabs.query({ url: `${origin}/*` });
  if (landing?.id !== undefined && !owned.has(landing.id)) {
    owned.add(landing.id);
    await navigate(landing.id, url, 30_000, true);
    return { tabId: landing.id };
  }
  const [windowId] = idle.keys();
  if (!focus && windowId !== undefined) {
    clearTimeout(idle.get(windowId));
    idle.delete(windowId);
    const [blank] = await ext.tabs.query({ windowId });
    if (blank?.id !== undefined) {
      owned.add(blank.id);
      if (url !== "about:blank") await navigate(blank.id, url, 30_000);
      return { tabId: blank.id };
    }
  }
  const tab = focus
    ? await ext.tabs.create({ url, active: true })
    : (await ext.windows.create({ url, focused: false })).tabs?.[0];
  if (tab?.id === undefined) throw new Error("Could not open a tab.");
  owned.add(tab.id);
  const ready = loaded(tab.id, 30_000, url);
  if ((await ext.tabs.get(tab.id)).status !== "complete") await ready;
  return { tabId: tab.id };
}

async function close(tabId: number) {
  if (!owned.has(tabId)) return null;
  owned.delete(tabId);
  const tab = await ext.tabs.get(tabId).catch(() => null);
  if (!tab) return null;
  const siblings = await ext.tabs.query({ windowId: tab.windowId });
  if (siblings.length > 1) {
    await ext.tabs.remove(tabId);
    return null;
  }
  // Closing a window's last tab would close the window, and maybe the browser, between checks.
  await ext.tabs.update(tabId, { url: "about:blank" });
  idle.set(
    tab.windowId,
    setTimeout(() => {
      idle.delete(tab.windowId);
      void ext.windows.remove(tab.windowId).catch(() => {});
    }, 60_000),
  );
  return null;
}

async function run(tabId: number, name: string, arg: unknown) {
  if (!owned.has(tabId)) throw new Error("That tab does not belong to AmICited.");
  const script = pageScripts().get(name);
  if (!script) throw new Error(`Unknown page script: ${name}`);
  const [result] = await ext.scripting.executeScript({
    target: { tabId },
    func: script.fn,
    args: [arg],
  });
  if (result?.error) throw new Error(String(result.error));
  return result?.result ?? null;
}

async function handle(request: BridgeRequest) {
  try {
    const value =
      request.method === "open"
        ? await open(request.params.url, request.params.focus)
        : request.method === "goto"
          ? await navigate(request.params.tabId, request.params.url, request.params.timeoutMs).then(
              () => null,
            )
          : request.method === "run"
            ? await run(request.params.tabId, request.params.script, request.params.arg)
            : await close(request.params.tabId);
    send({ type: "result", id: request.id, ok: true, value });
  } catch (error) {
    send({
      type: "result",
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// The app may start after the browser; retry quietly. Pings keep a Chromium service worker alive.
ext.alarms.create("connect", { periodInMinutes: 0.5 });
ext.alarms.onAlarm.addListener(connect);
ext.runtime.onStartup.addListener(connect);
ext.runtime.onInstalled.addListener(connect);
setInterval(() => send({ type: "ping" }), 20_000);
connect();
