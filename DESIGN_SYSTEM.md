# Chorebank Design System Contract

This is the implementation contract for all current and future UI work in this app.

## Source Of Truth Order

1. The current project style guide, when provided
2. This file (`DESIGN_SYSTEM.md`)
3. This file (`DESIGN_SYSTEM.md`) as implementation enforcement guidance

If this file conflicts with either style guide, the style guides win.

## Non-Negotiable Rules

- Use only tokenized values from `:root` in [`chorebank.css`](src/app/chorebank.css).
- Gold palette is reward-only: stars, coins, payday CTA/tag, cost chips, balance chips.
- Do not use an icon pack for chores/rewards. Use native emoji.
- Custom SVG symbols are limited to: `coin`, `star-claimed`, `star-pending`, `star-bonus`.
- New UI variants must be class-based, not ad-hoc inline styles.
- Inline style is only allowed for dynamic runtime values (animation delay, particle position/scale).

## Typography Contract

- Display font: `Fredoka` (400/500/600/700)
- Body font: `Plus Jakarta Sans` (400/500/600/700)
- Required import:
  - `https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap`

### Type scale tokens

- `5xl`: `4rem` (celebration balance)
- `4xl`: `3.2rem`
- `3xl`: `2.2rem`
- `2xl`: `1.7rem` (child name)
- `xl`: `1.3rem` (balance chip number)
- `lg`: `1.05rem` (`coins` label)
- `base`: `0.9rem`
- `sm`: `0.8rem`
- `xs`: `0.7rem`

## Color Contract

### Required neutrals

- `--ink-primary #1E2A3A`
- `--ink-secondary #6B7280`
- `--ink-tertiary #9CA3AF`
- `--ink-inverse #FFFFFF`
- `--divider #E5DFD6`
- `--bg-canvas #F5F0EA`
- `--bg-card #FFFFFF`

### Child accents

- Primary: `--primary-600/500/400/300/200/100`, `--primary-blue`
- Secondary: `--secondary-600/500/400/300/200/100`
- Accent stripes:
  - Primary: `linear-gradient(90deg, var(--primary-500), var(--primary-blue))`
  - Secondary: `linear-gradient(90deg, var(--secondary-500), var(--secondary-400))`

### Reward palette

- Gold tokens: `--gold-600/500/400/300/200/100`
- Bonus tokens: `--bonus-fill/stroke/bg/border`
- Semantic: `--success`, `--success-light`, `--interest-green`, `--danger`, `--danger-light`

## Shape + Elevation Contract

- Radii:
  - `--radius-sm 8px`
  - `--radius-md 14px`
  - `--radius-lg 20px`
  - `--radius-xl 28px`
  - `--radius-full 999px`
- Shadows:
  - `--shadow-sm: 0 1px 3px rgba(30,42,58,0.06)`
  - `--shadow-md: 0 4px 12px rgba(30,42,58,0.08)`
  - `--shadow-lg: 0 8px 30px rgba(30,42,58,0.12)`
  - `--shadow-glow-gold: 0 0 16px rgba(245,184,61,0.4)`

## Emoji + Symbol Contract

### Chore emoji

- `Make Bed 🛏️`, `Brush Teeth 🪥`, `Tidy Room ✨`, `Feed Pet 🐕`, `Reading 📚`, `Put Away Toys 🧸`, `Bonus 🌟`

### Reward emoji

- `Pick Dinner 🍽️`, `Screen Time 📺`, `Movie Night Pick 🎬`, `Ice Cream Outing 🍦`, `Stay Up Late 🌙`, `Toy Store Trip 🧸`, `Adventure Day 🎢`, `Camping Trip 🏕️`

### UI emoji

- Demo children use generic avatars; Store `🏪`, Complete `🏆`, Week `📅`, Celebrate `🎉`, Settings `⚙️`, Redemptions `🎁`

## State Contracts

### Star cell states (must match style guide)

- `empty`: `#EAE6DF`, `2px solid #D9D4CB`, dash, not tappable
- `future`: white, `1.5px dashed #E0DBD3`, not tappable
- `pending`: `gold-100`, `2.5px solid gold-400`, tappable
- `claimed`: `gold-200`, `2px solid gold-400`, not tappable
- `bonus`: `bonus-bg` + `bonus-border`
- Pending pulse animation: `2.4s ease-in-out infinite`

### Parent Fast Award chore row states

- default, selected, awarded (green locked row)
- awarded rows are non-tappable and show `✓ {day}` badge
- awarded style persists for the selected day, even when row is not selected

## Layout Contracts

- Kids board tablet: 2-up split (`1fr 1fr`), visible side-by-side on target 11" tablet usage
- Kids narrow mode: one child at a time + explicit switcher
- Chore grid table layout is fixed; label column and 7 day cells preserved
- Week columns run Sat -> Fri, Friday is payday column with gold accent
- Parent screens are phone-first, max width around 420px
- Reward Store is split on tablet, single child on narrow

## Motion + Sound Contract

### Required motion timing

- pending pulse: `2.4s`, `ease-in-out`, infinite
- See Payday float: `3s`, `ease-in-out`, infinite
- claim star: special reward interaction (customized in implementation)
- payday sequence: staged, `~2-3s`, skippable
- redemption success: `~400ms`
- interest bonus: distinct visual treatment from regular stars

### Sound behavior

- Sounds on by default
- Globally toggleable in parent settings
- Must fail gracefully until first user gesture unlocks audio

## Component Contract (Reusable Building Blocks)

Use these primitives for future screens before introducing new component families.

- frame/layout: `phone-frame`, `p-header`, `p-body`, `p-footer`, `section-banner`
- child identity: `child-id`, `child-avatar`, `child-name`, `coin-chip chip-balance`
- controls: `child-pill`, `day-chip`, `store-btn`, `award-btn`, `award-bonus-btn`, `payday-confirm-btn`
- parent rows: `nav-item`, `setting-row`, `child-config`, `queue-item`
- chips/badges: `coin-chip chip-cost`, `ni-badge`, `ci-awarded-badge`
- state flags: `.selected`, `.awarded`, `.is-disabled`, `.is-future`, `.active-*`

## Future Screen Policy (Parent Editors + Forms)

For screens like interest-rate input, reward item CRUD, child editor, chore manager:

1. Start with `phone-frame` shell.
2. Reuse existing row primitives (`setting-row`, `nav-item`, `child-config`) first.
3. Keep typography/color from existing tokens and scales.
4. Use existing semantic state colors; do not invent alternate status palettes.
5. Keep touch targets >= 44px and visible keyboard focus.
6. Keep left alignment behavior consistent with current parent UI rows.

## Parent Settings V3 Contract (Locked)

The parent settings screen is now a single scrollable phone-frame surface and must follow this exact section order:

1. `Children`
2. `Chores`
3. `Reward Store`
4. `Household`
5. `App`
6. `Danger Zone`

### Save Behavior Rules

- Auto-save (no explicit save button):
  - household single-value fields (`Payday Day`, `Interest Rate`)
  - app toggles (`Sounds`, `Animations`)
  - chore inline edits (emoji + label blur)
  - chore assignment chips in child cards
- Explicit save:
  - child profile card (`avatar`, `name`, `color`, `age`, optional `PIN`)
  - reward edit form (expanded reward card)
  - add reward form
  - add chore form
- Auto-save confirmation is row-level flash only:
  - `.saved-flash` using `save-flash` keyframes (`0.8s ease-out`)

### Action Button Contract

- Context actions are always a 32x32 circular button:
  - class: `.ps-action-btn`
  - border: `1.5px solid var(--divider)`
  - icon: 16px Lucide stroke icon
  - tap interaction: `transform: scale(0.9)`
- Semantic tap tint:
  - archive: gold tint (`gold-100` / `gold-600`)
  - delete: danger tint (`danger-light` / `danger`)
- Touch target must be >= 44x44 using expanded hit area (`.ps-action-btn::before`).

### Icon System Contract

- Lucide-style SVG symbols are used for app chrome and controls only:
  - `chevron-left`, `chevron-right`, `calendar`, `trending-up`, `volume-2`, `sparkles`, `archive`, `x`, `trash-2`, `grip-vertical`
- Native emoji are used for user content only:
  - child avatars, chore icons, reward icons

### Child Color Swatch Contract

- Child profile includes a 44x44 swatch field implemented with native `input[type="color"]`.
- The picked hex is stored in `child.accent`.
- Child palette is derived from this single hex and mapped to child token ramps:
  - `600`: darker accent
  - `500`: picked base
  - `400`: lighter accent
  - `300`, `200`, `100`: progressively lighter tints
- Implementation utility: [`child-theme.ts`](src/lib/chore-board/child-theme.ts)
- Runtime override:
  - app root sets primary/secondary CSS variables from live child accents.

### Reusable Parent Settings Primitives

Use these classes when building new parent admin forms:

- layout: `settings-spec-frame`, `settings-spec-content`, `ps-group`, `ps-group-header`, `ps-group-title`
- child cards: `ps-child-card`, `ps-child-card-head`, `ps-child-card-body`, `ps-field-row`, `ps-field`, `ps-field-input`
- list editing: `ps-chore-row`, `ps-item-actions`, `ps-reward-card`, `ps-reward-edit-top`, `ps-reward-edit-fields`
- controls: `ps-action-btn`, `ps-btn-save`, `ps-btn-save-green`, `ps-btn-cancel`, `ps-add-item-btn`, `toggle`
- settings rows: `ps-setting-row`, `ps-setting-icon`, `ps-setting-info`, `ps-setting-control`
- destructive: `ps-danger-zone`, `ps-danger-title`, `ps-danger-btn`

## Enforcement Checklist (PR Gate)

All new UI changes should pass this checklist:

- No unauthorized color/font/radius/shadow values
- No icon library introduced for chore/reward icons
- Gold not used outside reward mechanics
- State classes used instead of one-off styling
- Motion durations align with style-guide ranges
- Parent rows remain left-aligned and touch-friendly
- New components documented in this file if they are reusable
- Parent settings UI preserves the locked V3 section order and save-pattern rules
