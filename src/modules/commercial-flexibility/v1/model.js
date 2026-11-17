// Flexible-packaging projection. Pure functions so a future version can swap the
// model without touching the UI.

const DAYS_PER_MONTH = 30.4

// Observed pace in percentage points of purchased capacity per week.
export function observedPace(account) {
  const purchased = account.telemetry.purchased_capacity
  return purchased ? (account.velocity / purchased) * 100 : 0
}

// Default "assisted" pace: what we assume adoption could do with packaging +
// enablement support. Never below a modest floor so stalled accounts can be modelled.
export const defaultAssistedPace = (account) => Math.max(1.5, Math.round(observedPace(account) * 2) / 2)

export function project(account, { extensionMonths, pacePerWeek }) {
  const runwayDays = Math.max(0, account.daysToRenewal)
  const extendedDays = runwayDays + extensionMonths * DAYS_PER_MONTH
  const at = (days) => Math.max(0, account.realization + (pacePerWeek / 100) * (days / 7))
  return {
    runwayDays,
    extendedDays,
    atRenewal: at(runwayDays),
    atExtended: at(extendedDays),
    // Same contract value spread over a longer term → lower annualised ARR.
    annualisedArr: (account.arr_value * 12) / (12 + extensionMonths),
  }
}

// Months of extension needed to reach the target at the given pace (null = unreachable).
export function monthsToTarget(account, pacePerWeek, target) {
  if (account.realization >= target) return 0
  if (pacePerWeek <= 0) return null
  const weeks = ((target - account.realization) * 100) / pacePerWeek
  const days = weeks * 7 - Math.max(0, account.daysToRenewal)
  return Math.max(0, Math.ceil(days / DAYS_PER_MONTH))
}
