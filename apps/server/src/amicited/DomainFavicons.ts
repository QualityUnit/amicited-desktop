import { CommandId, ProjectId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SecureRandom from "effect/crypto/SecureRandom";
import { FetchHttpClient, HttpClient } from "effect/http";

import * as ServerConfig from "../config.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { isWithinRoot } from "../workspace/KnownWorkspaces.ts";

const MAX_FAVICON_BYTES = 256 * 1024;
const SAFE_PROJECT_ID = /^[\w-]+$/;
const SAFE_HOSTNAME = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/** Sites often answer /favicon.ico with an HTML page, so the bytes decide the type. */
export function faviconExtension(bytes: Uint8Array): string | null {
  const startsWith = (...signature: ReadonlyArray<number>) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "png";
  if (startsWith(0x00, 0x00, 0x01, 0x00)) return "ico";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (startsWith(0xff, 0xd8, 0xff)) return "jpg";
  const head = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (startsWith(0x52, 0x49, 0x46, 0x46) && head.slice(8, 12) === "WEBP") return "webp";
  const text = head.trimStart().toLowerCase();
  return (text.startsWith("<svg") || text.startsWith("<?xml")) && text.includes("<svg")
    ? "svg"
    : null;
}

export const domainFaviconDirectory = (path: Path.Path, stateDir: string, projectId: string) =>
  path.join(stateDir, "amicited-favicons", projectId);

export interface DomainFaviconTarget {
  readonly projectId: string;
  readonly hostname: string;
}

export class DomainFavicons extends Context.Service<
  DomainFavicons,
  {
    /** Points each domain project at its live site favicon, once per project and hostname. */
    readonly sync: (domains: ReadonlyArray<DomainFaviconTarget>) => Effect.Effect<void>;
  }
>()("t3/amicited/DomainFavicons") {}

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const http = yield* HttpClient.HttpClient;
  const projects = yield* ProjectService.ProjectService;
  const random = yield* SecureRandom.SecureRandom;
  const { stateDir } = yield* ServerConfig.ServerConfig;
  // A failed download waits for the next server start rather than retrying on every list.
  const attempted = new Set<string>();

  const download = Effect.fn("DomainFavicons.download")(function* (hostname: string) {
    const response = yield* http.get(`https://${hostname}/favicon.ico`);
    if (response.status < 200 || response.status >= 300) return null;
    if (Number(response.headers["content-length"] ?? 0) > MAX_FAVICON_BYTES) return null;
    const bytes = new Uint8Array(yield* response.arrayBuffer);
    if (bytes.length > MAX_FAVICON_BYTES) return null;
    const extension = faviconExtension(bytes);
    return extension ? { bytes, extension } : null;
  });

  const syncOne = Effect.fn("DomainFavicons.syncOne")(function* (domain: DomainFaviconTarget) {
    if (!SAFE_PROJECT_ID.test(domain.projectId) || !SAFE_HOSTNAME.test(domain.hostname)) return;
    const directory = domainFaviconDirectory(path, stateDir, domain.projectId);
    const saved = yield* fileSystem
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    // A saved file means the icon was applied once; a later reset to Automatic stays reset.
    if (saved.some((name) => name.startsWith(`${domain.hostname}.`))) return;
    const key = `${domain.projectId}\0${domain.hostname}`;
    if (attempted.has(key)) return;
    attempted.add(key);

    const projectId = ProjectId.make(domain.projectId);
    const project = yield* projects.getShell(projectId);
    if (Option.isNone(project)) return;
    const { faviconPath, projectIcon } = project.value;
    // Keep an icon the user picked in project settings.
    if (projectIcon || (faviconPath && !isWithinRoot(path, faviconPath, directory))) return;

    const icon = yield* download(domain.hostname).pipe(
      Effect.timeout(Duration.seconds(10)),
      Effect.orElseSucceed(() => null),
    );
    if (!icon) return;
    const file = path.join(directory, `${domain.hostname}.${icon.extension}`);
    yield* fileSystem.makeDirectory(directory, { recursive: true });
    yield* fileSystem.writeFile(`${file}.tmp`, icon.bytes);
    yield* fileSystem.rename(`${file}.tmp`, file);
    yield* projects
      .update({
        commandId: CommandId.make(`amicited-domain-favicon:${yield* random.uuidV4()}`),
        projectId,
        faviconPath: file,
      })
      .pipe(Effect.onError(() => fileSystem.remove(file).pipe(Effect.ignore)));
    // Icons of a previous hostname for this project.
    yield* Effect.forEach(saved, (name) => fileSystem.remove(path.join(directory, name)), {
      discard: true,
    });
  });

  const sync: DomainFavicons["Service"]["sync"] = (domains) =>
    Effect.forEach(domains, (domain) => syncOne(domain).pipe(Effect.ignoreCause({ log: true })), {
      concurrency: 4,
      discard: true,
    });

  return DomainFavicons.of({ sync });
});

export const layer = Layer.effect(DomainFavicons, make).pipe(Layer.provide(FetchHttpClient.layer));
