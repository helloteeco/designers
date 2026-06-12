# Reference: Teeco "Design & Install Guide" — page map

Ground truth for the Install Guide print route, transcribed from the real
client deliverable `2 Hiddenwoods Ct. Design & Install Guide (v1)` (26 pp,
Canva export, mixed page sizes). Every page carries a tiny mixed-case
**"Page X of 26"** footer at the bottom-right.

Typography: page titles are centered, UPPERCASE, **light** weight, gently
letter-spaced — no overlines, no rules. (What reads as "flanking rule
segments" at low resolution on board pages is the top edge of the board
image peeking out at the page edges on pages where the board rises above
the title line, e.g. p11/p13.) Body font is a geometric sans
(Montserrat-like). Charcoal ink, warm stone-gray accents.

| Page | Content | Layout notes |
|------|---------|--------------|
| 1 | Cover | Split layout. LEFT white panel: small inline lockup (circled house glyph + lowercase "teeco" on one line), heavy two-line headline "DESIGN &" / "INSTALL GUIDE", then small "Kelly + Zyaire" and "2 Hiddenwoods Ct." RIGHT ~45%: exterior photo inset from the top/right/bottom edges by a white margin. |
| 2 | Floor plan | Centered "FLOOR PLAN". Plan large at left (with designer scribbles: lawn swatch, pool). Right column: "Occupancy: 12" + bullets "Bed 1 - Queen Bed - 2 Guests" / "Bed 2 - Queen Bed - 2 Guests" / "Bed 3 - (x2) Queen over Queen Bunk - 8 Guests" (plain hyphens). Below: "KEY:" with **short colored line segments** — Art - (cyan), Mirror - (yellow), TV - (red). Markers on the plan are line segments, not dots. |
| 3 | LIVING ROOM board 1 | Board bleeds nearly full width/height. Bottom-right corner: tiny stacked "KEY:" (Art/Mirror/TV line swatches) + room-cropped plan thumbnail. Bottom-left empty. |
| 4 | LIVING ROOM board 2 | Same treatment, second view of the room. |
| 5 | LIVING ROOM - AI RENDER | Two renders staggered: one upper-left (~60% w), one lower-right overlapping with a white edge. Bottom: verbatim tiny-italic disclaimer (see below). |
| 6 | DINING board | Key + plan thumbnail sit bottom-LEFT on this page (corner placement varies with board composition). |
| 7 | DINING - AI RENDER | Single render, large and centered. Disclaimer. |
| 8 | KITCHEN board 1 | Key + thumb bottom-right. |
| 9 | KITCHEN board 2 | Same. |
| 10 | KITCHEN - AI RENDER | Two renders staggered. Disclaimer. |
| 11 | BEDROOM 1 board | Board nearly full-bleed. Bottom-left: "TIPS" + 3 bullets (verbatim below). Bottom-right: KEY + plan thumbnail. |
| 12 | BEDROOM 1 - AI RENDER | Single render. Disclaimer. |
| 13 | BEDROOM 2 board 1 | TIPS + KEY + thumb as p11. |
| 14 | BEDROOM 2 board 2 (desk wall) | Same blocks. |
| 15 | BEDROOM 2 - AI RENDER | Two renders staggered. Disclaimer. |
| 16 | BEDROOM 3 board (bunk room) | TIPS + KEY + thumb. |
| 17 | BEDROOM 3 - AI RENDER | Single render. Disclaimer. |
| 18 | BATHROOM 1 | Board nearly full width. Bottom band: tall plan crop at left; "KEY:" — Mirror - (yellow), Towel bar + art above - (cyan), Towel hooks - (purple), Towel ring - (orange); "TIPS" — Install towel bar 42-48" from floor. / Install towel hooks 70" from floor. / Install towel ring 20" from vanity countertop. / Install Toilet paper holder 26" from the floor. |
| 19 | BATHROOM 2 | Same layout; TIPS adds "One small plant goes on top floating shelf of each bathroom." and "One framed art goes above towel rack in each bathroom." |
| 20 | EXTERIOR | Board collage upper-left ~80%; circular inset photo (patio set) overlapping lower-right. No key, no plan thumbnail. |
| 21 | HOW TO HANG CURTAINS: / HOW TO HANG ART: | Two stacked centered sections. Curtains: intro copy, then DO:/DON'T: diagrams. Art: intro copy, then over-sofa + four-frame-grid diagrams with 60"/3-4" dimension lines. |
| 22 | RUG PLACEMENT: / THROW PILLOWS: / THROW BLANKETS: | Top: rug heading spanning two columns (sofa top-down left, bed top-down right), captions above diagrams. Bottom: pillows (left) and blankets (right), each with own heading + caption. |
| 23 | ORDERING TIPS | 2×2 rounded-outline cards, small circled icon overlapping each card's top border: Ordering & Organization (cart), Discounts (tag), Tracking Orders (clipboard), Priority Purchases (!). Nested bullet copy (verbatim in `StaticPages.tsx`), incl. HostGPO / Minoan referral links. |
| 24 | PRE-INSTALL CHECKLIST | Big light title + subtitle "Go through the 7-Day Setup Document in your Starter Pack to ensure a smooth, organized setup!" Six steps, 2 columns × 3 rows in row-major order (1,2 / 3,4 / 5,6): huge stone-gray numeral + rounded speech-bubble card. |
| 25 | INSTALL EXECUTION | Identical layout & subtitle, different six steps. |
| 26 | Contact | Full-width photo band across the top; centered inline teeco lockup; "Designer" + name; row of three centered fields: Website (teeco.co) · Email Address · Phone Number. |

## Verbatim copy blocks

**AI render disclaimer (p5/7/10/12/15/17):**

> \*This rendering is AI generated and is not exact, but similar to the
> products selected showing a close to accurate image of design. Please
> refer to the floor plan for the correct furniture placement. Renderings
> are for visual inspiration only and may not reflect exact layout or
> proportions.

**Bedroom TIPS (p11/13/14/16):**

- Each mattress gets one throw blanket + one throw pillow. Lay throw
  blankets across the bed from left to right.
- Hang mirror 4" above baseboard.
- Bend the branches on the plants to help make it look more realistic

**Curtains (p21):** "Hang curtains high and wide. 6-10" from either side of
window and hung to graze floor. Please have the rod overhang the bracket
3-4"."

**Art (p21):** "Position center of art at eye level (about 60" from floor)
or about 6-8" from furniture. For side-by-side art, allow 3-4" of space
between each piece of art."

**Rug/pillow/blanket captions (p22):** "Front legs of sofa and chairs
should sit on the rug." · "Position rug under the bottom two thirds of the
bed." · "Pillow inserts should be 1-2" larger than the pillow cover. Fluff
and karate chop." · "Fold and lay horizontally across the foot of the bed"

Pre-install / install-execution step copy and the four Ordering Tips cards
are transcribed in full in
`src/components/install-guide/StaticPages.tsx`.
