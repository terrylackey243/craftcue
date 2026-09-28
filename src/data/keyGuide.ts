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
      'Open the Anthropic Console and sign up with your email address or Google account. It\'s free to create an account.',
      'This is a different account from the Claude chat app. If you already use Claude, you can sign in with the same email.',
    ],
    alt: 'The Anthropic Console sign-in page',
    link: '/',
  },
  {
    shot: 'billing',
    title: 'Add some credit',
    body: [
      'In the Console, open Settings, then Billing. Add a payment card and buy a small amount of credit. $5 is plenty to start.',
      'You pay ahead of time, so you can never be charged more than you put in (unless you turn on auto-reload).',
    ],
    alt: 'The Billing page in the Anthropic Console, showing the credit balance and the button to buy credits',
    link: '/settings/billing',
  },
  {
    shot: 'limits',
    title: 'Set a monthly spending limit (recommended)',
    body: [
      'Still in Settings, open Limits. Set a monthly spend limit, for example $5. If CraftCue ever used more than that in a month, it would simply stop working until the next month.',
    ],
    alt: 'The Limits page in the Anthropic Console, where a monthly spend limit can be set',
    link: '/settings/limits',
  },
  {
    shot: 'create-key',
    title: 'Create an API key',
    body: ['Open API keys and choose Create key. Give it a name you\'ll recognise, like "CraftCue on my iPad".', 'Copy the key straight away. It starts with sk-ant- and is only shown once.'],
    alt: 'The API keys page in the Anthropic Console with the Create key button',
    link: '/settings/keys',
    warn: 'The key is only shown once. If you lose it, just delete it and create a new one.',
  },
]
