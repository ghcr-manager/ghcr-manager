#!/usr/bin/env node
/* global process */

import { scenarios } from "./test-scenarios/_definitions.mjs";
import { resolveScenarioTagNames } from "./test-scenarios/_resolve-tag-names.mjs";

const scenarioId = process.argv[2];
const executor = process.argv[3];
const repositoryName = process.argv[4];

if (!scenarioId || !executor || !repositoryName) {
  throw new Error("usage: node tools/tests/resolve-test-scenario.mjs <scenario> <executor> <repository-name>");
}

const scenario = scenarios[scenarioId];
if (!scenario) {
  throw new Error(`unknown scenario: ${scenarioId}`);
}

if (!scenario.supportedExecutors.includes(executor)) {
  throw new Error(`scenario '${scenarioId}' does not support executor '${executor}'`);
}

const resolvedTagNames = resolveScenarioTagNames(scenario);

process.stdout.write(
  JSON.stringify({
    scenarioId: scenario.id,
    executor,
    packageName: `${repositoryName}-${scenario.packageSuffix}`,
    seedStrategy: scenario.seedStrategy,
    digestSelectorTagNameKey: scenario.digestSelectorTagNameKey ?? null,
    tagNames: resolvedTagNames,
    ghcrManagerArgs: scenario.ghcrManagerArgs.map((value) => _replaceTagTokens(value, resolvedTagNames)),
    dataaxiomInputs: Object.fromEntries(
      Object.entries(scenario.dataaxiomInputs).map(([key, value]) => [key, _replaceTagTokens(value, resolvedTagNames)])
    )
  })
);

function _replaceTagTokens(value, tagNames) {
  return value.replaceAll(/\{([a-zA-Z0-9]+)\}/g, (_match, key) => {
    if (!(key in tagNames)) {
      throw new Error(`unknown tag token '${key}' in scenario '${scenarioId}'`);
    }
    return tagNames[key];
  });
}
