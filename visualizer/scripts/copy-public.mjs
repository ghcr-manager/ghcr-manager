#!/usr/bin/env node

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const _scriptDirectory = dirname(fileURLToPath(import.meta.url));
const _workspaceDirectory = resolve(_scriptDirectory, "..");
const _sourceDirectory = resolve(_workspaceDirectory, "public");
const _targetDirectory = resolve(_workspaceDirectory, "dist", "public");

rmSync(_targetDirectory, { recursive: true, force: true });
mkdirSync(resolve(_workspaceDirectory, "dist"), { recursive: true });
cpSync(_sourceDirectory, _targetDirectory, { recursive: true });
