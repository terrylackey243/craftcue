// Money helpers. Per-piece costs can be tiny ($1.26 / 80 = $0.01575), so never round them to
// cents while storing, and show enough digits that they don't display as "$0.00".

/** Cost of one unit from a pack price, or undefined if either number is missing. */
export function perUnitFromPack(packPrice: number | undefined, packSize: number | undefined): number | undefined {
  if (!(packPrice !== undefined && packPrice >= 0) || !(packSize !== undefined && packSize > 0)) return undefined
  return packPrice / packSize
}

/** $12.50, $1.26, $0.016, $0.0042 — two decimals normally, three significant digits below 10 cents. */
export function formatMoney(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return ''
  if (n === 0) return '$0.00'
  if (Math.abs(n) >= 0.1) return `$${n.toFixed(2)}`
  const digits = Math.min(6, Math.max(3, 1 - Math.floor(Math.log10(Math.abs(n))) + 1))
  return `$${Number(n.toFixed(digits)).toString()}`
}

/** Parse what someone typed into a money box: "$1.26", "1,26", " 1.26 " all work. */
export function parseMoney(text: string): number | undefined {
  const cleaned = text.replace(/[$\s]/g, '').replace(',', '.')
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
