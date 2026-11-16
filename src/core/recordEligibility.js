// Runtime provenance, kept outside the production save schema. Once a scenario
// changes a game's state, restarting that instance cannot make it legitimate.
const scenarios = new WeakSet();
const stateOf = (source) => source?.state ?? source;

export function excludeScenario(source) {
  const state = stateOf(source);
  if (state && typeof state === 'object') scenarios.add(state);
}

export function recordEligible(source) {
  return !scenarios.has(stateOf(source));
}
