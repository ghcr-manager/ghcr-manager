export function resolveScenarioTagNames(scenario) {
  return { ...(scenario.tagNames ?? {}) };
}
