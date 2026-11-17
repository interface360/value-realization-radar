// Business rules used by the dashboard, the sync server and the AI assistant.
// Change them here only. See docs/metrics.md.
export const THRESHOLDS = {
  // Value Realization % below this is considered under-adopted.
  lowRealization: 0.4,
  // Renewals inside this many days are "imminent".
  renewalWindowDays: 90,
  // Furthest renewal shown on the radar's x-axis.
  radarHorizonDays: 365,
  // Weeks of usage history used to estimate current consumption velocity.
  velocityWindowWeeks: 4,
}
