import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import yml from "eslint-plugin-yml";
import { onlyIndexCrossFolderRule } from "./tools/tests/eslint-rules/only-index-cross-folder.mjs";

/** @type {any[]} */
const _tsRecommendedConfigs = /** @type {any[]} */ (tseslint.configs.recommended);

export default defineConfig(
  {
    ignores: [".venv/**", "dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  ..._tsRecommendedConfigs,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "visualizer/src/**/*.ts", "visualizer/tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    plugins: {
      architecture: {
        rules: {
          "only-index-cross-folder": onlyIndexCrossFolderRule
        }
      }
    },
    rules: {
      "architecture/only-index-cross-folder": "error"
    }
  },
  ...yml.configs["flat/recommended"],
  {
    files: ["**/*.{yml,yaml}"],
    rules: {
      "yml/file-extension": ["error", { extension: "yml" }]
    }
  },
  {
    files: [".github/workflows/*.yml"],
    rules: {
      "yml/no-empty-mapping-value": "off"
    }
  }
);
