# Stocks directory UI review — 2026-10-21

The directory now defaults to the full 2,535-company universe in a responsive card grid. Cards share aligned company identities, symbols, sector labels, close prices, quote dates, and detail links. The palette follows the existing Stockerboard emerald/slate theme in light and dark modes. Missing logos retain readable initials; unavailable sectors remain explicitly identified.

Added sector filtering, alphabetical and price sorting, featured/all collections, optional compact rows, 24-company pagination, clear filters, and an empty state. Search and selected filters/layout persist in the URL. Featured companies link to their company pages; other symbols use the existing Home research route.

## Verification

- Browser checked at localhost:8502: three equal-width columns and equal-height cards at 1265px; no horizontal overflow.
- Browser checked alias search (Zomato), sector filter (54 Financial Services companies), descending price order, compact/grid switching, pagination (24 to 48), featured collection (20), empty state and clearing, company detail navigation and browser-back restoration, and light/dark colors.
- 98 Python website regression tests passed; 5 Pro snapshot unit tests passed.
- 9 directory selection behavior assertions passed; shared navigation and Pro JavaScript checks passed; directory JavaScript syntax passed.
- Candidate refresh build verified directory generation and byte-identical CSS/JS assets. Publish manifest includes both assets.
- Screenshot: outputs/stocks-directory-grid.png.

Responsive CSS uses four columns on wide displays, three on desktop, two on tablet, and one on narrow phones. A physical mobile viewport screenshot was not available in this browser session.
