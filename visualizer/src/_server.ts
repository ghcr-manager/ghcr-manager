import Database from "better-sqlite3";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GraphRepository } from "./_graph-repository.js";

const _mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"]
]);

export interface VisualizerServerOptions {
  databasePath: string;
  host: string;
  port: number;
}

export interface VisualizerServerHandle {
  readonly url: string;
  close(): Promise<void>;
}

export async function startVisualizerServer(options: VisualizerServerOptions): Promise<VisualizerServerHandle> {
  const database = new Database(options.databasePath, { readonly: true, fileMustExist: true });
  const repository = new GraphRepository(database);
  const baseDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const publicDirectory = join(baseDirectory, "public");
  const cytoscapePath = join(baseDirectory, "..", "node_modules", "cytoscape", "dist", "cytoscape.esm.min.mjs");

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    try {
      if (url.pathname.startsWith("/api/")) {
        _writeJson(response, 200, _handleApi(repository, url));
        return;
      }

      if (url.pathname === "/vendor/cytoscape.js") {
        await _streamFile(response, cytoscapePath);
        return;
      }

      const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const staticPath = resolve(publicDirectory, `.${requestedPath}`);
      if (!staticPath.startsWith(publicDirectory)) {
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      }

      await _streamFile(response, staticPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        _writeJson(response, 404, { error: "not found" });
        return;
      }

      const message = error instanceof Error ? error.message : "unexpected error";
      const statusCode = message.includes("not found") || message.includes("required") ? 404 : 400;
      _writeJson(response, statusCode, { error: message });
    }
  });

  let url = "";
  await new Promise<void>((resolvePromise) => {
    server.listen(options.port, options.host, () => {
      const address = server.address();
      if (typeof address === "object" && address) {
        url = `http://${options.host}:${address.port}`;
        console.log(`Visualizer listening at ${url}`);
      }
      resolvePromise();
    });
  });

  return {
    url,
    async close(): Promise<void> {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }

          resolvePromise();
        });
      });
      database.close();
    }
  };
}

function _handleApi(repository: GraphRepository, url: URL): unknown {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 4 || segments[0] !== "api" || segments[1] !== "packages") {
    throw new Error("not found");
  }

  const owner = decodeURIComponent(segments[2]);
  const packageName = decodeURIComponent(segments[3]);
  const scanId = _parseOptionalInteger(url.searchParams.get("scan_id"));

  if (segments.length === 6 && segments[4] === "scans" && segments[5] === "latest") {
    return { scanId: repository.resolveLatestScanId(owner, packageName) };
  }
  if (segments.length === 5 && segments[4] === "manifests" && url.searchParams.has("digest")) {
    return repository.resolveManifest(owner, packageName, scanId, {
      digest: url.searchParams.get("digest") ?? undefined
    });
  }
  if (segments.length === 5 && segments[4] === "manifests" && url.searchParams.has("tag")) {
    return repository.resolveManifest(owner, packageName, scanId, { tag: url.searchParams.get("tag") ?? undefined });
  }
  if (segments.length === 6 && segments[4] === "manifests") {
    return repository.getManifest(owner, packageName, scanId, decodeURIComponent(segments[5]));
  }
  if (segments.length === 5 && segments[4] === "graph") {
    const centerDigest = url.searchParams.get("center_digest");
    if (!centerDigest) {
      throw new Error("center_digest is required");
    }

    return repository.getGraph(
      owner,
      packageName,
      scanId,
      centerDigest,
      _parseOptionalInteger(url.searchParams.get("depth")) ?? 1
    );
  }

  throw new Error("not found");
}

function _parseOptionalInteger(raw: string | null): number | undefined {
  if (raw === null || raw === "") {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) {
    throw new Error(`invalid integer value: ${raw}`);
  }

  return value;
}

async function _streamFile(response: import("node:http").ServerResponse, path: string): Promise<void> {
  if (!existsSync(path)) {
    throw Object.assign(new Error("not found"), { code: "ENOENT" });
  }

  const fileStat = await stat(path);
  if (!fileStat.isFile()) {
    throw Object.assign(new Error("not found"), { code: "ENOENT" });
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", _mimeTypes.get(extname(path)) ?? "application/octet-stream");
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
    stream.pipe(response);
  });
}

function _writeJson(response: import("node:http").ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
