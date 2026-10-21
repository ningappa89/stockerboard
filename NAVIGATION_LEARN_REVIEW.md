# Shared navigation and Learn review — 21 October 2026

## Completed

- Replaced the inconsistent secondary-page headers with templates/partials/header.html. Stocks, 20 featured company pages, 10 lessons, the Learn hub and 7 informational pages now use the main Stockerboard emblem and wordmark. The Research badge and alternate Learn dot are gone.
- Home and Pro use the same assets/logo.svg. The Home emblem is now a normal, accessible Home link rather than a div with an inline mode-switch handler.
- The four navigation links have one route contract: Home `/`, Stocks `/stocks/`, Learn `/learn/`, Pro research `/?mode=pro`. They stay on the current origin, including localhost:8502, without hardcoded development ports.
- Added correct aria-current states for the actual section, synchronized after mode changes, browser Back/Forward and restored pages. Shared theme controls use the same stored theme as the main site.
- Updated all relevant generators so rebuilds preserve the shared header. Daily candidate generation includes the shared scripts, styles, Learn styles, and the logo asset.
- Improved Learn's light/dark visual hierarchy, cards, reading width, focus states and responsive spacing. Added search across all ten lessons, four category filters, result counts and a no-results message. Acronym searches such as P/E select the intended lesson.
- Improved lesson reading-control semantics and scroll offsets so the sticky reading bar does not cover the section heading. Kept the original educational content and quizzes.

## Verified

- 98 website Python tests passed, including new cross-page navigation and lesson inventory checks.
- 5 focused Pro snapshot tests passed.
- Node navigation, Pro interaction and financial-rendering checks passed.
- Company and Stocks directory deterministic-build checks passed.
- Daily candidate preserves shared branding and all required UI assets.
- Browser on localhost:8502 checked Home → Pro → Stocks → Learn, repeated without reload, and browser Back to Pro. Each section kept its correct active state and the same logo asset.
- Browser checked a featured company header, both Learn themes, all category counts (10, 7, 2, 1), P/E search (one lesson), cash-flow search (one lesson), zero results, lesson reading controls and both correct-answer quiz feedback panels.

## Cache note

During verification, a previously visited Stocks page initially retained its old header from the browser cache. A reload picked up the generated shared header. A subsequent navigation pass worked without reloads. An existing browser tab may need one hard refresh after these changes.

## Limits

Visual checks used the desktop browser. Narrow-screen layout rules were reviewed and updated; a separate mobile viewport screenshot was not captured. No production deployment or account-authentication changes were made.

Previews are in outputs/navigation-review/: stocks-header.png, learn-light.png and learn-dark.png.
