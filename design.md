# Design - RegChula

Locked design system for all RegChula routes. Extend this file before introducing a page-local visual
exception.

## Genre

Modern-minimal Metronic-inspired enterprise workspace with a utilitarian institutional voice. The influence is
limited to information hierarchy, compact grouping, and contextual tooling; no Metronic code,
assets, Bootstrap, Sass, or Keenicons are part of this project.

## Macrostructure family

- App shell: Enterprise workspace with grouped Work, Manage, and Plan navigation; a compact
  persistent sidebar; and a utility toolbar that is transparent at the page origin and becomes an
  opaque token-backed sticky surface after scrolling. Current term and nested language/color-mode
  choices live in the top-right profile dropdown. Mobile removes the bottom rail and opens the same
  grouped sidebar from a top-left Menu control. The sidebar slides from the left, closes through its
  top-right collapse control, route selection, Escape, or a dismissable outside backdrop, and restores
  focus to the toolbar trigger. A rightward swipe on non-interactive page space opens it and a leftward
  swipe closes it, with the panel tracking the finger continuously. Sliders, horizontal scroll areas,
  form controls, vertical scrolling, and other overlays keep their own gestures. The sidebar has
  square corners and a short horizontal settle animation; reduced motion uses opacity.
- Login: Split Studio - focused sign-in rail paired with a readable policy and contact document.
- Search: Catalogue - broad term/archive discovery. The toolbar provides six debounced course suggestions with keyboard selection and a
  single advanced-search button that preserves text and opens the catalogue filters. Search state
  follows external URL navigation before writing debounced filter edits.
  Catalogue controls include searchable unit/department selectors, weekday range buttons,
  time/credit ranges, and requirement-aware results. Browsing-term selection opens a single overlay
  list directly from the header, without expanding the page layout.
- Registration: Form Repeater - current-term-only autocomplete rows, available-section selection,
  auto-calculated credits, explicit removal, and one overall save confirmation. Compact widths use
  readable course cards with labeled section, mode and credit fields and an icon-only remove action.
- Management: Compact management form table for both drop and withdrawal, with explicit
  confirmation and a clean-room withdrawal request preview.
- Schedule: time-horizontal/day-vertical weekly grid on every viewport, nested horizontal scrolling
  on phones, plus registered-course cards and student-owned course colors.
  Hour columns retain a readable minimum width on phones. PNG exports are laid out separately at
  fixed pixel dimensions before capture and include course details below the grid. Export-only pixel
  spacing and type sizes are intentional so browser viewport size cannot change the image layout.
  On compact screens, blocks show course code, catalogue short name (full-name fallback), and building/room.
  Long names truncate to one line while full names remain in the course details below.
  Unused hour tracks narrow but remain visible,
  and empty weekdays use shorter rows. Weighted positioning preserves partial-hour start/end alignment.
  Saturday and Sunday are omitted unless a course uses the day. Section/time details remain below
  the grid and in desktop/export layouts; red borders still identify conflicts on compact screens.
- Exams: side-by-side midterm/final boards followed by the detailed table; the table scrolls inside
  its container on phones, and missing source schedules remain explicitly unannounced.
- Appearance: Two-column settings workspace with live component preview, persisted profile,
  language/readability, color/theme, layout, behavior, and reset sections.
- Course detail: one spacious scrollable panel containing metadata, sections, and reviews; no tabs
  hiding related course information. Size the actual Dialog, never the positioning wrapper.
- Directories: Read-only building and faculty/department indexes sourced from authorized public
  data. The faculty directory expands faculty, department, and field-of-study rows in a consistently aligned hierarchy.

## Theme

- Light canvas: #fcfcfc
- Light content surface: #ffffff
- Light secondary controls: #f1f1f4
- Dark canvas: #0f1014
- Dark content surface: #15171c
- Dark secondary controls: #1a1a1a
- Sidebar: #0d0e12 in either mode; it anchors the workspace without competing with content
- Ink: neutral slate; never mixed with the selected accent.
- Rules: subtle neutral gray in both themes; cards and fields never carry an accent wash.
- Accent: per-student preset or validated custom color. It owns solid primary actions, active
  navigation and selected controls. The default Chula pink is #db5f8d. Supporting surfaces,
  input focus rings, rules, shadows, and text neutrals stay independent of the accent.
  Canvas, content cards, sidebar, and secondary controls retain their explicit neutral values.
  Accent-filled text still uses a readable foreground calculation.
- Focus: contrast-safe neutral slate, independent of accent choice.

## Responsive width

- Default content layout is fluid: pages use the available width beside a fixed 15rem sidebar.
- Desktop gutters cap at 2.5rem, including 1920, 2560, and 3440px displays.
- The optional contained layout uses the saved 960–1360px width. Existing widths are retained when
  profiles gain the new fluid default; users can switch back without losing their setting.
- Page headings stay compact; content panels and tables grow with available space, not typography.
- Titles and descriptions form one left-aligned group; page actions align right. The catalogue term
  control shares this header instead of occupying a separate row or an invisible grid column.
- Search icons belong inside the shared Field control. Drawer.Content only positions the overlay;
  panel backgrounds, padding, and size belong to Drawer.Dialog.

Canonical light/dark values and all supporting roles live in root tokens.css.

## Typography

- Display: Anuphan, weight 800, normal.
- Body: Noto Sans Thai, weight 400/700.
- Optional mono: IBM Plex Mono for technical output only.
- Display tracking: -0.03em.
- Body measure: 45-75 characters.

## Spacing and surfaces

- Four-point named spacing from tokens.css; no raw component spacing values.
- One containment layer. Rows and rules before nested cards. Enterprise panels use restrained
  elevation and compact data density rather than stacked decorative cards.
- Accent footprint stays below 5% of each viewport.
- Primary actions use accent fill with a readable calculated foreground.

## Motion and interaction

- Button press, dialog crossfade, compact search popover, and command-palette selection only.
- Appearance controls update locally at interaction time; sliders persist on release rather than
  delaying their displayed value.
- Accent-dependent surfaces use the shared project and HeroUI semantic bridges. Error, warning,
  and success colors remain semantic rather than becoming the selected accent.
- Appearance choices use explicit check badges. Decorative color dots are not used as a selected
  state signal.
- Solid labels use opaque course-owned colors for schedule blocks and solid semantic HeroUI Chips;
  conflict labels remain semantic red, while cards, fields, hover states, and neutral chrome stay
  independent of label presentation.
- Silent success when result is visible.
- Focus appears instantly.
- Reduced motion collapses spatial movement to 150ms opacity.
- Popup scroll locking reserves scrollbar space so Select, menu, Modal, Drawer, and AlertDialog
  interactions preserve scroll position and page geometry. Closing an overlay restores focus to the
  explicit action that opened it.
- Footer occupies the viewport bottom on short pages, but remains in normal document flow after
  longer page content; it never overlays actions or forms.

## Page distinctions

- Search may select historical terms and exposes every catalog filter.
- Registration is always current-term-only and shows credit/state context before results.
- Historical pages never display registration actions.
- App pages never use decorative enrichment. Dashboard orders term context, credit use, active
  registrations, next action, and announcements by operational priority.
- Exam views never invent rooms because the imported catalog only supplies course-level date and time.
- Academic requirements are advisory. Registration groups prerequisites, corequisites, manual conditions, and class/exam overlaps into expandable controls; related-course links open separately to preserve the draft. The save confirmation shows a fresh batch review before committing, and warning-only drafts offer Save anyway. Raw complex conditions remain visible without an inferred approval.
- Class and exam clashes are visible non-blocking warnings. Overlapping class meetings occupy
  separate readable lanes; unknown and adjacent time slots never produce a clash warning.
- Every active course has a stable automatic palette color. Student/term/course overrides persist
  in MySQL and apply to both planning views. Conflict presentation always overrides that color with
  semantic red without discarding the saved choice.
- Withdrawal selections and reasons restore per student and term on the same device. The printable
  CR48 uses a neutral A4 layout with four course slots and handwriting space; omit exam dates.

## Shared elements

- Text wordmark, theme, typography, button voice, route rail, profile dropdown, compact topbar
  search, and
  Ft2 status footer.
- Complex controls use HeroUI v3 components built on React Aria: Select, searchable multi-select
  Drawer/Modal pickers, ComboBox autocomplete, Chip, ProgressBar, RadioGroup, Slider,
  ColorSwatchPicker, ColorPicker, Toast, AlertDialog, InputOTP, Modal, Popover, and Drawer. Native time and
  number inputs remain native where they are the clearest range controls.
- Tailwind CSS v4 is imported before @heroui/styles; page-specific structure remains in CSS Modules.
- Lucide React is the only application icon library. Icons use named imports, inherit semantic
  color, and remain decorative unless a control needs an accessible label.
- Static interface copy is complete in Thai, English, and Chinese. Course data remains sourced in
  Thai/English and falls back truthfully rather than being machine translated.
- Mobile widths 320, 375, 414, and 768 remain first-class.

## Exports

### CSS

Use root tokens.css directly.

### Tailwind v4 mapping

- color-paper -> --color-paper
- color-ink -> --color-ink
- color-accent -> --color-accent
- font-display -> --font-display
- font-body -> --font-body
- spacing roles -> --space-*

### DTCG core mapping

- color.paper = oklch(97% 0.012 350)
- color.ink = oklch(20% 0.014 350)
- color.accent = oklch(48% 0.18 350)
- font.display = Anuphan
- font.body = Noto Sans Thai

### shadcn-compatible mapping

- background = paper
- foreground = ink
- primary = accent
- primary-foreground = accent-ink
- muted = paper-2
- muted-foreground = muted
- border/input = rule
- ring = focus
