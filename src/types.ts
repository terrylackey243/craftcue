// Data model — spec section 4. Every stored record has a UUID `id`, `createdAt`, `updatedAt`
// (ISO strings), except the keyed caches noted below.

export interface Timestamps {
  createdAt: string
  updatedAt: string
}

export const UNITS = ['sheet', 'roll', 'ft', 'yd', 'piece', 'pack', 'blank', 'bottle', 'other'] as const
export type Unit = (typeof UNITS)[number]

export const ADHESIVES = ['none', 'removable', 'permanent', 'iron-on', 'self-adhesive'] as const
export type Adhesive = (typeof ADHESIVES)[number]

export type SupplySource = 'manual' | 'barcode' | 'vision' | 'import'

export interface Supply extends Timestamps {
  id: string
  name: string
  category: string // Category.id
  subtype?: string
  brand?: string
  color?: string
  finish?: string
  dimensions?: string
  quantity: number
  unit: Unit
  /** Show the low-stock badge at or below this quantity. Defaults to 1. */
  lowAt?: number
  adhesive?: Adhesive
  upc?: string
  /** Cost of one unit (one piece, sheet, foot…). Filled in from the pack price when one is given. */
  unitCost?: number
  /** What a whole pack cost, if bought by the pack. */
  packPrice?: number
  /** How many units come in one pack. For one color of a mixed pack: how many of that color. */
  packSize?: number
  /** Colors from the same mixed-color pack share a set id and name. */
  setId?: string
  setName?: string
  location?: string
  thumbnail?: string // data URL, ~400px JPEG
  notes?: string
  source: SupplySource
}

export interface Category {
  id: string
  name: string
  /** Suggested units, first is the default. */
  units: Unit[]
  /** Common sizes offered as quick picks. */
  sizes: string[]
  /** Suggested subtypes offered as quick picks. */
  subtypes?: string[]
  defaultAdhesive?: Adhesive
  custom?: boolean
}

export interface MachineProfile {
  id: string
  brand: string
  name: string
  cutWidthIn: number
  /** Cut width when a mat is used, if different from cutWidthIn. */
  matCutWidthIn?: number
  /** Longest single cut without a mat, if the machine supports it. */
  maxMatlessLengthIn?: number
  maxMaterialThicknessMm: number
  matlessSmartMaterials: boolean
  printThenCut: boolean
  compatibleTools: string[]
  defaultTools: string[]
  notes: string[]
  verified: boolean
  sourceUrls: string[]
  /** Generic profile: the user types width and thickness themselves. */
  userDefined?: boolean
}

export interface ToolDefinition {
  id: string
  name: string
  enables: string[]
  plainDescription: string
}

export const EQUIPMENT = [
  { id: 'heat-press', name: 'Heat press' },
  { id: 'mini-heat-press', name: 'Mini heat press' },
  { id: 'mug-press', name: 'Mug press' },
  { id: 'inkjet-printer', name: 'Inkjet printer' },
  { id: 'laminator', name: 'Laminator' },
  { id: 'sewing-machine', name: 'Sewing machine' },
  { id: '3d-printer', name: '3D printer' },
  { id: 'household-iron', name: 'Household iron' },
  { id: 'hot-glue-gun', name: 'Hot glue gun' },
] as const
export type EquipmentId = (typeof EQUIPMENT)[number]['id']

export type SkillLevel = 'beginner' | 'comfortable' | 'experienced'
export type Quality = 'standard' | 'best'

export interface BackupReminderSettings {
  enabled: boolean
  afterChanges: number
  afterDays: number
}

export interface UserSetup {
  id: 'setup'
  machineId: string
  /** Only used with a userDefined (generic) machine profile. */
  customMachine?: { cutWidthIn: number; maxMaterialThicknessMm: number; name?: string }
  ownedToolIds: string[]
  equipment: string[] // EquipmentId values
  equipmentOther: string
  skillLevel: SkillLevel
  interests: string[]
  aiEnabled: boolean
  quality: Quality
  upcLookupEnabled: boolean
  backupReminder: BackupReminderSettings
  fontScale: number // 1 = default; accessibility setting
  setupComplete: boolean
  createdAt: string
  updatedAt: string
}

/** One color in a mixed-color pack, e.g. { color: 'Rocket Red', count: 3 }. */
export interface PackColor {
  color: string
  count: number
}

export interface UpcCacheEntry {
  upc: string // primary key
  /** For a mixed-color pack, includes `colors` and the set's shared details. */
  proposedSupply: Partial<Supply> & { colors?: PackColor[] }
  confirmedAt: string
  timesUsed: number
}

export interface Person extends Timestamps {
  id: string
  name: string
  relationship?: string
  ageRange?: string
  interests: string[]
  notes?: string
  pastGiftProjectIds: string[]
}

export type Goal = 'sell' | 'decor' | 'gift'
export type ProjectStatus = 'idea' | 'planned' | 'made' | 'dismissed'

export interface SupplyUse {
  supplyId: string
  amount: number
  unit: string
}

export interface MissingItem {
  item: string
  why: string
  estCost?: string
}

export interface SellInfo {
  unitCostEst?: string
  priceLow?: string
  priceHigh?: string
  batchNotes?: string
}

export interface Project extends Timestamps {
  id: string
  title: string
  summary: string
  whyItFits?: string
  goal: Goal
  goalContext: GoalRequest | Record<string, unknown>
  personId?: string
  status: ProjectStatus
  difficulty?: number
  estMinutes?: number
  uses: SupplyUse[]
  missing: MissingItem[]
  toolsNeeded: string[]
  equipmentNeeded: string[]
  steps: string[]
  designTips: string
  sellInfo?: SellInfo
  safetyNotes: string[]
  userNotes?: string
  photoThumb?: string
  aiGenerated: boolean
  madeAt?: string
  madeCount?: number
}

export type AiFeature = 'recommend' | 'vision-intake' | 'test-key'

export interface UsageLogEntry {
  id: string
  timestamp: string
  feature: AiFeature
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Shopping list entries the user adds or ticks off. Aggregated items are derived, not stored. */
export interface ShoppingCheck {
  key: string // stable key of the aggregated line
  checkedAt: string
}

// ----- Recommendation requests (spec 9.1) -----

export interface CommonRequest {
  onlyWhatIHave: boolean
  maxDifficulty: number // 1-5
  timeAvailable: string // "under 1 hour", "an afternoon", ...
  count: number
  extra?: string
}

export interface SellRequest extends CommonRequest {
  goal: 'sell'
  where: 'craft fair' | 'online' | 'local shop' | 'not sure'
  howMany: number
  priceTarget?: string
  theme?: string
}

export interface DecorRequest extends CommonRequest {
  goal: 'decor'
  room: string
  season?: string
  style?: string
  sizeLimits?: string
}

export interface GiftRequest extends CommonRequest {
  goal: 'gift'
  personId?: string
  relationship?: string
  ageRange?: string
  interests?: string
  occasion: string
  budget?: string
}

export type GoalRequest = SellRequest | DecorRequest | GiftRequest
