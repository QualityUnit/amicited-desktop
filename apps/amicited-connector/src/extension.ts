/** The slice of the WebExtension API the connector uses; Chrome and Firefox both provide it. */
export interface Tab {
  readonly id?: number;
  readonly windowId: number;
  readonly status?: string;
  readonly url?: string;
}
interface Event<F> {
  addListener(listener: F): void;
  removeListener(listener: F): void;
}
export interface ExtensionApi {
  readonly runtime: {
    getManifest(): { readonly version: string };
    getBrowserInfo?(): Promise<{ readonly name: string; readonly version: string }>;
    readonly onStartup: Event<() => void>;
    readonly onInstalled: Event<() => void>;
  };
  readonly alarms: {
    create(name: string, info: { readonly periodInMinutes: number }): void;
    readonly onAlarm: Event<(alarm: { readonly name: string }) => void>;
  };
  readonly tabs: {
    query(query: { readonly url?: string; readonly windowId?: number }): Promise<Tab[]>;
    create(props: {
      readonly url: string;
      readonly active: boolean;
      readonly windowId?: number;
    }): Promise<Tab>;
    update(
      tabId: number,
      props: { readonly url?: string; readonly active?: boolean },
    ): Promise<Tab>;
    get(tabId: number): Promise<Tab>;
    remove(tabId: number): Promise<void>;
    readonly onUpdated: Event<(tabId: number, change: { readonly status?: string }) => void>;
  };
  readonly windows: {
    create(props: { readonly url: string; readonly focused: boolean }): Promise<{
      readonly id?: number;
      readonly tabs?: Tab[];
    }>;
    get(windowId: number): Promise<{ readonly id?: number }>;
    remove(windowId: number): Promise<void>;
  };
  readonly scripting: {
    executeScript(injection: {
      readonly target: { readonly tabId: number };
      readonly func: (arg: never) => unknown;
      readonly args: readonly unknown[];
    }): Promise<{ readonly result?: unknown; readonly error?: unknown }[]>;
  };
}
const scope = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };
export const ext = (scope.browser ?? scope.chrome)!;
