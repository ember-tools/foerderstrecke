/** How far apart two pressures, distances or hose counts may lie and still count as equal, so
 * rounding in sums like 0.1 + 0.2 never tips a check or a count. */
export const EPSILON = 1e-9
