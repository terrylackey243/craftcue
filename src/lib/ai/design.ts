// Claude designs a project as a structured layout; CraftCue draws and checks it. If the checks
// find problems, the design goes back to Claude once to fix them.
import type Anthropic from '@anthropic-ai/sdk'
import { AnthropicError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { effectiveMachine, machineLabel } from '../../data'
import { FONTS, FONT_NAMES } from '../design/fonts'
import { SHAPES, SHAPE_NOTES } from '../design/shapes'
import { DesignSchema, ICON_NAMES, PRODUCTS, type Design } from '../design/spec'
import { renderDesign, type RenderedDesign } from '../design/render'
import { checkDesign, PRINT_THEN_CUT_MAX, type CheckResult } from '../design/checks'
import type { Category, Project, Supply, UserSetup } from '../../types'
import { AiResponseError, checkStop, firstText, getAiClient, logUsage } from './aiClient'
import { recommendModel, supportsEffort } from './models'
import { wire } from './schemas'

export const DESIGN_RULES = `You are CraftCue's designer. You turn a craft project idea into an exact layout that CraftCue draws and exports as a cut file for a home cutting machine (like a Cricut). You never draw: you describe the layout using only the fonts, shapes, icons and elements listed below, and CraftCue draws them precisely.

Canvas: widthIn × heightIn is the finished piece (e.g. the 8 × 10 in frame opening, the sign board, the area on a shirt or mug). All positions are the CENTER of each element, in inches from the top-left corner. Keep everything at least 0.25 in inside the edges.

Layers are listed bottom to top. Anything that sits ON another piece (words on a banner, a leaf on a background) must be on a layer listed AFTER the thing it sits on, or it will be hidden. Each layer is one material:
- For materials from the crafter's stash, set supplyId to the stash id and a hex color that looks like that named color.
- operation "cut" for pieces cut out of a material, "score" for fold lines and leaf veins (paper only), "draw" for pen lines, "print" for Print Then Cut artwork.
- Every cut piece must fit on the material it's cut from (sheet sizes are listed) and within the machine's cut width.

Elements:
- Leave at least 0.15 in between separate things on the same layer (words, icons, shapes): anything touching is cut as one piece.
- text: one line each. capHeightIn is the height of a capital letter. For vinyl and cardstock keep capitals at least 0.5 in (0.75 in for script fonts, 1 in for fonts marked "keep it large"). Script fonts weld into one piece.
- shape: from the shape list; widthIn/heightIn is its size.
- icon: from the icon list; sizeIn is its larger side.
- branch: a stem with leaves (botanicals): stemLayer, leafLayers used in turn, optional veinLayer (a score layer), base at (x, y), rotationDeg 0 grows straight up.
- outline: traces around the combined shape of other layers by distanceIn, as a backing layer behind lettering, or the sticker cut line in Print Then Cut.
- Fold lines: a thin rectangle (heightIn 0.02) on a "score" layer becomes one score line down its middle. Keep it inside the piece it folds (measure the piece's width at that height).
- Words and art that sit on a background shape stay at least 0.25 in inside its edges (check the width of long words: roughly 0.75 × capHeightIn per letter for bold fonts).

Separate pieces: anything made separately that doesn't sit on the front of the finished piece (an easel back or stand, a card liner, box or envelope parts) goes BESIDE the main piece on the canvas, 0.5 in away, never overlapping it. Make the canvas wide enough for both. Only pieces that stack on the front overlap.

Print Then Cut: use mode "print-then-cut" only if the project uses printable or sticker paper. The printed piece must fit ${PRINT_THEN_CUT_MAX.w} × ${PRINT_THEN_CUT_MAX.h} in. Use one or more "print" layers for the artwork (different colors are fine, it's printed) and one "cut" layer, on the same paper, with an outline around the print layers; listed BEFORE the print layers so it is the background. For a sign, tag or card CraftCue joins that outline into one piece around everything; for a sticker-sheet each sticker gets its own.

Good design: clear hierarchy (one big main word or motif), balanced and centered unless the idea calls otherwise, 2–4 layers for layered vinyl or paper, sizes that suit the product (e.g. shirt chest designs about 10 in wide, mug wraps about 3–4 in tall). Only original wording: never characters, brands, logos, team names or song lyrics.

"assembly" gives short steps, in plain words, for making it from exactly the pieces in this design, which CraftCue hands over ready to cut. Never tell the crafter to design, draw, find or size artwork. For Print Then Cut, start with printing and cutting the printed piece, then the other pieces, then putting it together.`

function catalog(): string {
  return [
    'FONTS (name: style):',
    ...FONT_NAMES.map((f) => `- ${f}: ${FONTS[f].note}`),
    '',
    'SHAPES:',
    ...SHAPES.map((s) => `- ${s}: ${SHAPE_NOTES[s]}`),
    '',
    `ICONS: ${ICON_NAMES.join(', ')}`,
    '',
    `PRODUCTS: ${PRODUCTS.join(', ')}`,
  ].join('\n')
}

function materials(project: Project, supplies: Supply[], categories: Map<string, Category>): string {
  const byId = new Map(supplies.map((s) => [s.id, s]))
  const used = new Set(project.uses.map((u) => u.supplyId))
  const usedCats = new Set(project.uses.map((u) => byId.get(u.supplyId)?.category).filter(Boolean))
  // The project's own materials first, then other colors of the same kinds (for extra layers).
  const pick = supplies.filter((s) => used.has(s.id) || (usedCats.has(s.category) && s.quantity > 0))
  const line = (s: Supply) =>
    `${s.id} | ${s.name}${s.color ? ` — ${s.color}` : ''} | ${categories.get(s.category)?.name ?? s.category} | ${s.dimensions || 'size unknown'} | have ${s.quantity} ${s.unit}${used.has(s.id) ? ' | PLANNED FOR THIS PROJECT' : ''}`
  return pick.slice(0, 150).map(line).join('\n') || '(no stash materials listed)'
}

export interface DesignInput {
  project: Project
  supplies: Supply[]
  categories: Map<string, Category>
  setup: UserSetup
  /** "Change something": the current design plus what to change. */
  refine?: { previous: Design; request: string }
}

/** Only the parts of a design Claude writes (vector artwork outlines are not for Claude). */
const forClaude = ({ art: _art, artPrompt: _p, ...d }: Design) => d

export function buildDesignParams(input: DesignInput, fix?: { design: Design; problems: string[] }): Anthropic.MessageCreateParamsNonStreaming {
  const m = effectiveMachine(input.setup)
  const p = input.project
  const model = recommendModel(input.setup.quality)
  const context = [
    catalog(),
    '',
    `MACHINE: ${m ? machineLabel(m) : 'cutting machine'}, cuts up to ${m?.cutWidthIn ?? 12} in wide${m?.printThenCut ? ', can Print Then Cut' : ''}.`,
    '',
    'STASH MATERIALS (id | name — color | type | size | amount):',
    materials(p, input.supplies, input.categories),
  ].join('\n')
  const project = [
    `PROJECT: ${p.title}`,
    p.summary,
    p.steps.length ? `Steps: ${p.steps.join(' / ')}` : '',
    p.designTips ? `Design tips: ${p.designTips}` : '',
    p.goal === 'sell' ? 'This will be SOLD: original wording and motifs only.' : '',
  ]
    .filter(Boolean)
    .join('\n')
  let ask = `${project}\n\nDesign it.`
  if (input.refine) ask = `${project}\n\nCURRENT DESIGN:\n${JSON.stringify(forClaude(input.refine.previous))}\n\nChange it like this: ${input.refine.request}\nKeep everything else the same unless the change needs it.`
  if (fix) ask = `${project}\n\nYOUR DESIGN:\n${JSON.stringify(fix.design)}\n\nCraftCue found these problems. Fix them and return the corrected design:\n- ${fix.problems.join('\n- ')}`
  return {
    model,
    max_tokens: 16000,
    system: [
      { type: 'text', text: DESIGN_RULES },
      { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: ask }],
    output_config: { format: wire(designFormat), ...(supportsEffort(model) ? { effort: 'medium' } : {}) },
  } as Anthropic.MessageCreateParamsNonStreaming
}

const designFormat = zodOutputFormat(DesignSchema)

export function parseDesign(text: string): Design {
  try {
    return designFormat.parse(text) as Design
  } catch (e) {
    if (e instanceof AnthropicError) throw new AiResponseError('bad-response', 'The design came back in an unexpected shape.')
    throw e
  }
}

async function ask(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Design> {
  const client = await getAiClient()
  let last: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.createMessage(params)
    await logUsage('design', message)
    try {
      checkStop(message)
      return parseDesign(firstText(message))
    } catch (e) {
      last = e
      if (e instanceof AiResponseError && e.kind === 'refused') throw e
    }
  }
  throw last instanceof AiResponseError ? new AiResponseError('bad-response', "Couldn't get a usable design this time. Please try again.") : last
}

export interface DesignResult {
  design: Design
  rendered: RenderedDesign
  check: CheckResult
}

/** Design a project; if CraftCue's checks find problems, ask Claude once to fix them. */
export async function designProject(input: DesignInput): Promise<DesignResult> {
  const machine = effectiveMachine(input.setup)
  const evaluate = async (design: Design) => {
    const rendered = await renderDesign(design)
    return { design, rendered, check: checkDesign(rendered, { machine, supplies: input.supplies, mode: design.mode }) }
  }
  let result = await evaluate(await ask(buildDesignParams(input)))
  if (result.check.problems.length) {
    const fixed = await evaluate(await ask(buildDesignParams(input, { design: result.design, problems: result.check.problems })))
    // Keep whichever has fewer problems.
    if (fixed.check.problems.length <= result.check.problems.length) result = fixed
  }
  return result
}
