# OmaReach agent instructions

OmaReach is an Omarchy shell plugin (Quickshell/QML + bash) that blacks out
monitor edges you can't reach and keeps the bar and tiled windows in the
rest, with optional fills, including a btop-style stats dashboard. Plugin id
`pym.omareach`; public at https://github.com/mateuspim/omareach. The README
is the landing page; the user manual is `docs/guide/` (one page per
feature area), so read the guide before changing a feature.
`docs/architecture.md` says how the parts fit, `docs/adr/` why, `docs/specs/` what the contracts
are (settings file, IPC actions, `stats.sh` frames). `docs/README.md`
indexes the rest; update the spec a change touches.

## Project

- Layout: every `.qml` and `.js` file, `stats.sh`, `vpn.sh` and
  `cpu-power.sh` at the root. Omarchy loads the entry points in
  `manifest.json` (`Service.qml`, `Panel.qml`); QML finds siblings through
  `qmldir`, so a new component goes in `qmldir` too. Don't add QML subfolders. Tests in `tests/`, guide images
  in `docs/`.
- Logic that can live without QML goes in the `Model*.js` scripts
  (`Model.js` entries and fills, `ModelEdges.js` sizes and presets,
  `ModelProfiles.js` profiles, `ModelArt.js` clock and logo), the `Stats*.js` scripts (the dashboard's data: `Stats.js` keeps
  the state, `StatsProc.js`, `StatsNet.js`, `StatsSystem.js` and
  `StatsGpu.js` parse, `StatsFormat.js` has the palette and text forms) or
  `StatsTiles.js`, `StatsViews.js` and `StatsRows.js` (its layout, panels
  and shared rows), so Node can test it.
  `tests/qmljs.js` loads them; `tests/modelfixtures.js` and
  `tests/statsfixtures.js` load each family with its imports.
- Naming: OmaReach everywhere: plugin id and IPC target `pym.omareach`,
  layer namespaces `pym-omareach*`, settings `~/.config/omarchy/omareach.json`,
  log prefix `omareach:`. Never reintroduce `display-reserve` or
  `Display Reserve` (ADR 10); only CHANGELOG history, ADR 10 and the README's
  migration note name it.
- Qt 6.12: QtQuick exports its own `Color`. Write
  `import qs.Commons as Commons` and `Commons.Color.x`; never a bare `Color.`
  (ADR 9).
- Never edit `~/.config/hypr/monitors.lua` or run `hyprctl reload`: edges are
  reserved with layer-shell exclusive zones (ADR 1).
- Shell scripts: bash, builtins over new processes in anything that runs every
  second (`stats.sh`), plain-text results on stdout for QML to parse, errors
  on stderr with a non-zero exit.

## Code style

- Match the surrounding file: 2-space QML and JS, no semicolons where the file
  has none, typed QML properties where the shape is known.
- Names specific and greppable; early returns over nested ifs.
- No duplication: shared logic goes in the `Model*.js` or `Stats*.js`
  scripts.
- Keep files focused and under 500 lines, tests included: split by
  responsibility rather than growing them.

## Comments

- Keep existing comments; they carry intent and provenance.
- Write WHY, not WHAT. Name the upstream constraint or bug a line exists for
  (a Hyprland behaviour, a kernel interface, a CVE, a commit).

## Tests

- `npm test` runs every Node test (`tests/*.test.js`); CI runs the same.
  `sampler.test.js` runs the real `stats.sh`; `cpupower.test.js` runs
  `cpu-power.sh` against a made-up powercap tree and never needs root.
- Every new pure function gets a test; bug fixes get a regression test.
- Visual checks run offscreen only (ADR 4): a throwaway Quickshell config in
  the session scratchpad with `Commons` and `Ui` linked from
  `/usr/share/omarchy/shell`, a copy of the plugin and a `shell.qml` that
  `grabToImage`s one component, run with
  `QT_QPA_PLATFORM=offscreen quickshell -p <dir>`. `QT_SCALE_FACTOR=2` for
  crisp images; `offscreen:configfile=<json>` for named monitors; a throwaway
  `HOME` with a demo `omareach.json` so the user's settings stay out.
  The panel needs a `FloatingWindow` stand-in for `KeyboardPanel`. Shaders
  (`MultiEffect`) draw nothing offscreen. The full harness, with fake
  sampler data, is in `docs/runbooks/development.md`; the hero's
  captures in `docs/brand/captures/` come from it.
- Never screenshot (`grim`) or inject input (`wtype`) on the user's monitors.
  Deploy and let the user check by hand.
- Live shell log (read-only):
  `quickshell log -p /usr/share/omarchy/shell -t 200 | grep -i reserve`.
  Ask before restarting the user's shell.

## Public-repo hygiene

- No `/home/...` paths, real monitor serials or private names in tracked
  files; examples use `DP-4` and sample descriptions.
- The privilege model lives in `SECURITY.md`; update it when the plugin
  runs, reads or writes something new.
- Nothing runs as root except through `cpu-power.sh` in a visible terminal
  that shows its commands and asks first (ADR 8). Never modify user config
  on load.
- `HANDOFF.md` is local-only and stays gitignored.

## Commits and releases

- Commit subjects are plain imperative sentences ("Add …", "Fit …"), with a
  body that says why. Ask the owner before pushing commits or tags, and
  before publishing a GitHub release.
- Release: bump `version` in `manifest.json` and `package.json`, add the
  `CHANGELOG.md` entry, check the README and guides cover the change, `npm test`,
  `omarchy plugin validate .`, commit `Release X.Y.Z`, annotated tag
  `vX.Y.Z` ("OmaReach X.Y.Z"). After pushing, file the marketplace's
  "Plugin verification" issue with the full 40-character commit SHA.
  The same steps are in `docs/runbooks/development.md#release`.
