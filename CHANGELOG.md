# Changelog

All notable changes to AccuRuler are documented here.

## [1.0.0] - 2026-09-09

First public release. Chrome + Firefox (Manifest V3).

### Added

- Click-drag ruler overlay with live width, height, start and end labels.
- Auto-contrast chrome: border, crosshair and labels flip black/white to stay
  visible on any background.
- Smart label placement: labels sit outside the measured box and flip sides
  when there is no room.
- Configurable colors and units (CSS px, physical px, mm, cm) via the options
  page, persisted with `storage.sync`.
- Arrow-key nudging (1px, Shift = 10px); Esc cancels a drag or clears the
  ruler.
- Touch support via pointer events.
- Reliability: clean teardown on navigation, idempotent inject, no sticky
  state, repeat-measure safe.
- Works on dark pages, scrolled pages, zoomed pages, and pages using
  `<dialog>`/`popover`.