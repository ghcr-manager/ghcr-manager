import { cleanupScenarios } from "./_cleanup-scenarios.mjs";
import { graphScenarios } from "./_graph-scenarios.mjs";

export const scenarios = {
  ...cleanupScenarios,
  ...graphScenarios
};

export const scenarioIds = Object.keys(scenarios);

export const scenarioMatrix = scenarioIds.flatMap((scenarioId) =>
  scenarios[scenarioId].includeInMatrix === false
    ? []
    : scenarios[scenarioId].supportedExecutors.map((executor) => ({
        scenario: scenarioId,
        executor
      }))
);

export const graphScenarioMatrix = scenarioIds.flatMap((scenarioId) =>
  scenarios[scenarioId].includeInGraphMatrix === true
    ? scenarios[scenarioId].supportedExecutors.map((executor) => ({
        scenario: scenarioId,
        executor
      }))
    : []
);
