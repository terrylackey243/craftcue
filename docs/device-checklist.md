# Manual device checklist (spec 12)

Automated tests cover desktop Chrome and WebKit with an iPad-sized screen. Real devices need a
person. Run this before each release on the hosted URL.

| Check | iPad Safari (browser) | iPad (Home Screen) | iPhone Safari | Android Chrome | Desktop Chrome/Edge | Desktop Safari |
|---|---|---|---|---|---|---|
| Wizard completes, text readable without zoom | | | | | | |
| Add 20 items by hand ("Save and add another") | | | | | | |
| Barcode scan with camera (and manual entry) | | | | | | |
| Photo intake: package, loose item, whole shelf | | | | | | |
| Save a backup (share sheet or download works) | | | | | | |
| Clear site data → restore backup → everything back | | | | | | |
| Settings shows storage status | | | | | | |
| Add to Home Screen / Install, icon looks right | | | | | | |
| Works offline after first load (airplane mode) | | | | | | |
| Suggestions: all three goals, save, mark as made | | | | | | |
| Shopping list share | | | | | | |
| Text size 150% still usable | | | | | | |
| VoiceOver / TalkBack reads buttons sensibly | | | | | | |

**Clearing site data:**
- iPad/iPhone: Settings → Apps → Safari → Advanced → Website Data → remove the site.
- Chrome: the lock icon → Site settings → Delete data.

## Non-technical tester (Phase 4 done-when)

Give someone who hasn't seen the app only the link. Don't help. Success = they reach their first
suggestion using only the in-app help. Note every place they hesitate.
