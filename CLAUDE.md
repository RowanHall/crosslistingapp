# Crosslist — Design System & Conventions

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#EDE7DB` | Warm parchment — page backgrounds |
| `--card` | `#E2DACC` | Deeper parchment — cards, metric boxes |
| `--foreground` | `#141210` | Espresso near-black — body text |
| `--primary` | `#2D6A4F` | Forest green — CTAs, selected states, accents |
| `--primary-foreground` | `#ffffff` | White — text on primary bg |
| `--secondary` | `#D9D1C4` | Label patch — badge/chip backgrounds |
| `--muted` | `#E2DACC` | Muted backgrounds |
| `--muted-foreground` | `rgba(20,18,16,0.42)` | Dimmed text |
| `--border` | `rgba(20,18,16,0.11)` | Subtle borders |

## Typography

- **Headings / Labels**: `var(--font-barlow)`, weight 900, `uppercase tracking-tighter`
  - Apply via: `style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}`
- **Body**: DM Sans / system sans (`font-sans`)
- **Mono / Data**: DM Mono (`font-mono`)
- **Editorial captions**: Cormorant Garamond (`var(--font-serif)`)

## Rules

- **No border-radius** — all components use `rounded-none`
- **No dark mode** — the `.dark` CSS block has been removed; do not add it back
- **Grain texture** — add `grain-overlay` class to top-level page `<div>` for vintage texture
- **Selected state** — use `border-[#2D6A4F]` and `bg-[#2D6A4F]` (forest green), not black
- **Buttons (primary)** — `bg-primary text-primary-foreground hover:opacity-90`
- **Buttons (outline)** — `border border-border bg-background text-foreground hover:bg-muted`
- **No brutalist shadows** — avoid `shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]` patterns; use subtle `shadow-sm` or none

## Reference Page

`app/page.tsx` (homepage) is the canonical design reference. Do not modify it.

## Files Out of Scope

- `components/listing/MasterListingForm.tsx` — complex form, intentionally left with original styling
- `components/ui/*` — shadcn primitives, inherit via CSS vars automatically
- All API routes under `app/api/`
