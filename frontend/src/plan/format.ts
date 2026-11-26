const BAR = new Intl.NumberFormat('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})
const WHOLE = new Intl.NumberFormat('de-DE', {maximumFractionDigits: 0})
const POSITION = new Intl.NumberFormat('de-DE', {minimumFractionDigits: 5, maximumFractionDigits: 5})
const KILOMETRES = new Intl.NumberFormat('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})

/** A pressure in bar with one decimal, as gauges are read: "6,5 bar". */
export function formatBar(value: number): string {
    return `${BAR.format(Math.abs(value) < 0.05 ? 0 : value)} bar`
}

/** A distance in metres, in kilometres from 10 km on: "460 m", "12,35 km". */
export function formatDistance(metres: number): string {
    return metres >= 10_000 ? `${KILOMETRES.format(metres / 1000)} km` : `${WHOLE.format(metres)} m`
}

/** A height in whole metres: "312 m". */
export function formatHeight(metres: number): string {
    return `${WHOLE.format(metres)} m`
}

/** A length in metres with one decimal: "8,4 m". */
export function formatMetres(metres: number): string {
    return `${BAR.format(metres)} m`
}

/** A position as latitude and longitude with five decimals, about a metre: "51,79912° N 10,61561° E". */
export function formatPosition([latitude, longitude]: readonly [number, number]): string {
    return `${POSITION.format(latitude)}° N ${POSITION.format(longitude)}° E`
}

/** A whole number with German grouping: "1.000". */
export function formatWhole(value: number): string {
    return WHOLE.format(value)
}
