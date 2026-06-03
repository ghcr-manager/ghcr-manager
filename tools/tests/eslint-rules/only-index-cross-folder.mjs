import path from "node:path";

const srcRoot = path.resolve("src");
const testsRoot = path.resolve("tests");

function isInsideDirectory(filePath, directoryPath) {
  const relativePath = path.relative(directoryPath, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resolveImportTarget(importerPath, importPath) {
  const importerDirectory = path.dirname(importerPath);
  const resolvedBasePath = path.resolve(importerDirectory, importPath);
  const candidates = [
    resolvedBasePath,
    `${resolvedBasePath}.ts`,
    `${resolvedBasePath}.js`,
    path.join(resolvedBasePath, "index.ts"),
    path.join(resolvedBasePath, "index.js")
  ];

  return candidates.find((candidate) => path.extname(candidate) !== "");
}

function isIndexFile(filePath) {
  const baseName = path.basename(filePath);
  return baseName === "index.ts" || baseName === "index.js";
}

function isMappedTestImport(importerPath, targetPath) {
  if (!isInsideDirectory(importerPath, testsRoot) || !isInsideDirectory(targetPath, srcRoot)) {
    return false;
  }

  const importerRelativePath = path.relative(testsRoot, importerPath).replace(/\.test\.ts$/, ".ts");
  const targetRelativePath = path.relative(srcRoot, targetPath).replace(/\.js$/, ".ts");
  return importerRelativePath === targetRelativePath;
}

export const onlyIndexCrossFolderRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require imports from outside a folder to go through that folder's index file."
    },
    schema: [],
    messages: {
      onlyIndex:
        "Imports from outside a folder must go through that folder's index file. Import '{{requested}}' via the folder entrypoint instead."
    }
  },

  create(context) {
    const importerPath = path.resolve(context.filename);

    function checkSource(node) {
      const importPath = node.source?.value;
      if (typeof importPath !== "string" || !importPath.startsWith(".")) {
        return;
      }

      const targetPath = resolveImportTarget(importerPath, importPath);
      if (!targetPath) {
        return;
      }

      if (isMappedTestImport(importerPath, targetPath)) {
        return;
      }

      const targetDirectory = path.dirname(targetPath);
      if (isInsideDirectory(importerPath, targetDirectory) || isIndexFile(targetPath)) {
        return;
      }

      context.report({
        node: node.source,
        messageId: "onlyIndex",
        data: {
          requested: importPath
        }
      });
    }

    return {
      ImportDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
      ExportNamedDeclaration: checkSource
    };
  }
};
