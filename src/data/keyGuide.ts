// Text for the in-app API key guide (spec 7.2). Kept as data so it can be updated when the
// Anthropic Console changes. Each `shot` maps to docs/images/key-guide-<shot>.png.
// RE-CAPTURE the screenshots whenever the Console UI changes (see docs/images/README.md).

export const CONSOLE_URL = 'https://platform.claude.com'

/** Measured 2026-09-28 with recorded fixtures: 3.8–7.1c per round of 5 (Sonnet 5), 0.3–0.5c per photo (Haiku 4.5). */
export const COST_NOTE =
  'A round of 5 ideas costs about 4 to 7 cents with the Standard quality setting, and reading a photo costs well under a cent. $5 of credit goes a long way.'

export interface GuideStep {
  shot: string
  title: string
  body: string[]
  alt: string
  link?: string
  warn?: string
}

export const KEY_GUIDE_STEPS: GuideStep[] = [
  {
    shot: 'signup',
    title: 'Create an Anthropic Console account',
    body: [
      "Open the Claude Console and sign up with your email address or Google account. It's free to create an account.",
      'This is a different account from the Claude chat app. If you already use Claude, you can sign in with the same email.',
    ],
    alt: 'The Claude Console sign-in page',
    link: '/',
  },
  {
    shot: 'billing',
    title: 'Add some credit',
    body: [
      'In the menu on the left, choose Billing. Tap Buy credits, add a payment card, and buy a small amount. $5 is plenty to start.',
      'You pay ahead of time. Leave auto-reload off, and you can never be charged more than you put in.',
    ],
    alt: 'The Billing page, showing the credit balance and the Buy credits button',
    link: '/settings/billing',
  },
  {
    shot: 'limits',
    title: 'Set a monthly spending limit (recommended)',
    body: [
      'Scroll down the same Billing page to Spend limits. Next to Monthly spend limit, tap Adjust limit and set it to something small, like $5.',
      'If CraftCue ever used more than that in a month, smart features would simply pause until the next month.',
    ],
    alt: 'The Spend limits section of the Billing page, with the Adjust limit button',
    link: '/settings/billing',
  },
  {
    shot: 'create-key',
    title: 'Create an API key',
    body: [
      'In the menu on the left, choose API keys, then Create key.',
      'If a box about "identity federation" appears first, choose Continue with an API key. That option is for big companies.',
      'Fill in the form: Name: something like "CraftCue on my iPad". Expires: choose Never (a 30-day key would stop working next month). Scope: choose Default workspace.',
      'When you choose Never, a yellow warning about keeping keys safe appears. That is expected: CraftCue keeps the key only on your device, and your spending limit protects you.',
      'Tap Create key, then copy the key straight away. It starts with sk-ant- and is only shown once.',
    ],
    alt: 'The Create API key form with a name filled in, Expires set to Never and Scope set to Default workspace',
    link: '/settings/keys',
    warn: "The key is only shown once. If you lose it, just delete it and create a new one. If CraftCue ever says your key stopped working, make a new one here.",
  },
]
