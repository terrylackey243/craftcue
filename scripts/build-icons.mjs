// Builds src/data/icons.json from Phosphor Icons (MIT, fill weight): a curated, craft-friendly set.
// Run: node scripts/build-icons.mjs   (needs the @phosphor-icons/core dev dependency)
import { readFileSync, writeFileSync } from 'node:fs'

const NAMES = `heart star sun moon flower flower-lotus flower-tulip leaf plant tree tree-evergreen cactus butterfly bird
cat dog paw-print fish horse cow rabbit coffee wine beer-bottle cake cookie ice-cream pizza hamburger orange-slice carrot
ghost skull bone snowflake sparkle crown diamond gift balloon confetti music-note guitar camera book-open pencil scissors
needle palette paint-brush house church anchor sailboat airplane car bicycle mountains waves umbrella cloud rainbow
lightning drop fire campfire tent baseball basketball football soccer-ball volleyball tennis-ball golf trophy medal
graduation-cap baby baby-carriage t-shirt dress hand-heart hands-praying cross star-of-david peace smiley smiley-wink
sneaker coffee-bean bread egg cheese clover bell chat-circle envelope-simple map-pin tag key watch calendar clock
hourglass fork-knife cooking-pot flask first-aid bug feather puzzle-piece game-controller dice-five spade club`
  .split(/\s+/)
  .filter(Boolean)

const out = {}
for (const name of NAMES) {
  const svg = readFileSync(`node_modules/@phosphor-icons/core/assets/fill/${name}-fill.svg`, 'utf8')
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
  if (!paths.length) throw new Error(`no path in ${name}`)
  out[name] = paths
}
writeFileSync('src/data/icons.json', JSON.stringify({ source: 'Phosphor Icons (MIT), fill weight, 256x256', icons: out }))
console.log(`${Object.keys(out).length} icons`)
