import type { DeletePlan } from "../db/index.js";

export interface DeleteExecutionSummary {
  owner: string;
  packageName: string;
  scanCompletedAt: string;
  plannerInputs: DeletePlan["plannerInputs"];
  deletedPackageVersionCount: number;
  detachedTagCount: number;
  blockedRoots: DeletePlan["blockedRoots"];
}

export interface DeleteExecutionOptions {
  token: string;
  logger: DeleteExecutionLogger;
  fetchImpl?: GitHubPackageFetch;
  listRootTags?: (root: { owner: string; packageName: string; versionId: number; digest: string }) => string[];
}

export interface DeleteExecutionLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface GitHubPackageFetchResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<unknown>;
}

export type GitHubPackageFetch = (input: string, init?: RequestInit) => Promise<GitHubPackageFetchResponse>;
