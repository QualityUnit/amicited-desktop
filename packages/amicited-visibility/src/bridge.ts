/** Loopback port the AmICited Connector extension dials. */
export const defaultBridgePort = 47615;
export const bridgePath = "/connector";

/** Extension to app. */
export type ConnectorMessage =
  | {
      readonly type: "hello";
      readonly extensionVersion: string;
      readonly browser: { readonly name: string; readonly version: string };
      readonly scripts: readonly string[];
    }
  | {
      readonly type: "result";
      readonly id: number;
      readonly ok: boolean;
      readonly value?: unknown;
      readonly error?: string;
    }
  | { readonly type: "ping" };

/** App to extension. The extension runs only the page scripts it bundles, by name. */
export type BridgeCall =
  | { readonly method: "open"; readonly params: { readonly url: string; readonly focus: boolean } }
  | {
      readonly method: "goto";
      readonly params: { readonly tabId: number; readonly url: string; readonly timeoutMs: number };
    }
  | {
      readonly method: "run";
      readonly params: { readonly tabId: number; readonly script: string; readonly arg: unknown };
    }
  | { readonly method: "close"; readonly params: { readonly tabId: number } };
export type BridgeRequest = BridgeCall & { readonly type: "call"; readonly id: number };

/** Extension origins the bridge accepts; web pages cannot forge these. */
export function isExtensionOrigin(origin: string | undefined) {
  return /^(chrome-extension|moz-extension|safari-web-extension):\/\/[\w-]+$/.test(origin ?? "");
}
