// Guess a supply's category from its name, so "Kraft cardstock" typed after a vinyl entry doesn't
// quietly land in "Adhesive vinyl". Order matters: more specific phrases first.
const RULES: [RegExp, string][] = [
  [/infusible/i, 'infusible-ink'],
  [/\b(htv|iron[- ]?on|heat transfer)\b/i, 'iron-on'],
  [/\b(sticker paper|printable)\b/i, 'printable'],
  [/\btransfer tape\b|\bmat\b/i, 'transfer-tape-mats'],
  [/\bvinyl\b/i, 'adhesive-vinyl'],
  [/\b(cardstock|card stock|paper|vellum)\b/i, 'cardstock-paper'],
  [/\bfelt\b/i, 'felt'],
  [/\b(leather|cork)\b/i, 'leather'],
  [/\b(fabric|cotton|canvas|denim|fleece|fat quarter)\b/i, 'fabric'],
  [/\b(wood|basswood|balsa|chipboard|plywood)\b/i, 'wood-chipboard'],
  [/\bacrylic (blank|sheet|keychain|ornament)|\bacrylic\b(?!.*paint)/i, 'acrylic'],
  [/\b(metal|aluminum|stainless|brass|copper) (blank|tag|stamping)|\bdog tag\b/i, 'metal-blanks'],
  [/\bfoil\b/i, 'foil-sheets'],
  [/\b(t-?shirt|tee|hoodie|sweatshirt|onesie|bodysuit|hat|socks)\b/i, 'blanks-apparel'],
  [/\b(mugs?|tumblers?|glass cans?|cups?|wine glass(es)?|water bottles?)\b/i, 'blanks-drinkware'],
  [/\b(pillow|coaster|tote|tea towel|banner|doormat|ornament)\b/i, 'blanks-home'],
  [/\b(googly|rhinestone|ribbon|button|pom ?pom|sequin|twine|tassel|bead)/i, 'embellishments'],
  [/\b(glue|adhesive|tape|epoxy|mod podge)\b/i, 'adhesives-glue'],
  [/\b(paint|marker|pen|spray)\b/i, 'paint-markers'],
]

export function guessCategory(name: string): string | undefined {
  return RULES.find(([re]) => re.test(name))?.[1]
}
