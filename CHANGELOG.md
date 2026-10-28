# Changelog

## Unreleased

### Added

- **Clock panel** on the stats dashboard, opt-in: the time in the Clock
  fill's blocky digits (with seconds on a wide card), the date, the ISO
  week and day of the year, the next Omarchy reminder counting down, up
  to three other time zones ("Tokyo 13:37 · +12h", with the day when it
  is not today here), sunrise and sunset, and meters for how much of the
  day and the year has gone. A short card drops them from the end; a
  card less than very wide stacks its digits over its rows, so they keep
  their size. It follows the monitor's 12-hour setting, which the Fill
  page now offers for a dashboard with the Clock panel too.
- **Time zones and the sun** for the Clock panel, on the Stats page and
  over IPC (`zones`, `location`): zones are picked from tzdata's list,
  and **Sun** works out sunrise and sunset for the city of this
  machine's time zone (or exact coordinates over IPC). Nothing is looked
  up online; the offsets come from the new `zones.sh`, which uses bash's
  own clock, since QML's JavaScript has no time zones.
- **Seconds on the Clock fill** (`clockSeconds`), against burn-in: a
  blinking colon, or a bar under the time that fills over the minute.
- **Toast:** a key that acts away from the cursor (`f`, `i`, `p`, a
  profile, `x`, `0`, `u`) says what it did in the panel's footer for 3
  seconds, with "U to undo" when it can be undone.
- **Hiding a stats panel can be undone**, like a clear or a deleted
  profile.
- **The preview numbers its cards** on the Stats page, as the list does,
  and fills in the selected one's number: the key from a card to its
  entry.
- **The Battery card's info** names the emptiest peripheral ("Mouse
  12%") beside a laptop's battery, so a dying mouse shows even on a card
  too short for the device rows.
- **Tests for vpn.sh** against fake NordVPN, Mullvad, PIA, ExpressVPN,
  IVPN and Windscribe clients, so the clients only checked against their
  docs are covered end to end.

### Changed

- **Animation is a row of buttons** on the Stats page (Display, 60, 30,
  15, Off): the list ran past the panel's bottom. CPU power and Mesh
  addresses (now labeled **Mesh**) share the row under it.

## 1.10.0 — 2026-10-26

### Added

- **VPN on the Network card:** a VPN row names the VPN that is on and
  where it comes out ("Proton VPN · Miami, US"), and turns red with "off"
  when it drops. Proton VPN, NordVPN, Mullvad, PIA, IVPN, Windscribe and
  ExpressVPN give their place; Obscura and WARP their name; any other
  WireGuard, OpenVPN or PPP tunnel shows as "VPN". A plain `tun0`, as
  over OpenVPN, takes the name of the installed client that is
  connected. It reads the tunnels, not the default route, which VPN
  clients leave on the wired or wireless card.
- **Tailscale and other meshes** get a row of their own with how many
  peers are online. Hovering shows this machine's names and addresses,
  the exit node and each peer; a Tailscale exit node counts as a VPN.
- **Mesh addresses:** a switch on the Stats page (`statsTunnelAddress`,
  off by default) puts a mesh's address on its row.

## 1.9.0 — 2026-10-26

### Added

- **Keyboard on every page:** on the Fill, Stats and Profiles pages the
  arrows (or `h` `j` `k` `l`) move a cursor over the page's buttons,
  Enter presses the one under it and Shift+Enter right-clicks it. On the
  Stats page Shift with an arrow moves the selected panel and `x` hides
  it; on the Profiles page `x` deletes a profile, which `u` undoes. The
  Dim slider moves with left and right. The Edges page keeps its keys.
- **Clock options:** 12-hour time, and the date under the clock, or
  beside it on a short wide edge, wherever the time keeps most of its
  size. Per monitor, on the
  Fill page and over IPC (`clockHours`, `clockDate`).

### Changed

- **A shorter Stats page:** shown panels sit two to a row, and one row of
  Earlier, Later and Hide acts on the selected one, so ten panels take
  about 795 px instead of 985. Animation is a list rather than a button
  that cycles, and shares its row with CPU power.
- **Larger text on short strips:** wide cards need 8 units of height
  rather than 10, so a 2560×160 strip keeps 16 px text instead of 13, with
  a row fewer. They still need 22 units of width, so cards two to a row
  on a narrow portrait strip keep text that fits. A wide card's headline leaves out what has no room (the
  per-core bars first) rather than squeezing it.
- **Fill buttons are all one width**, with a short last row centered.
- **Wide cards** keep their rows within 32 units, so a label stays near
  its value; the graphs take the rest.
- **The ruler's labels** follow the shell's font size.
- **Right-clicking a shown stats panel** selects it rather than hiding it
  on every monitor, which was easy to do by mistake; Hide's right-click
  still hides it everywhere.
- **Battery devices by kind:** a peripheral reads "Mouse" or "Headset",
  as UPower knows it, rather than a model name a narrow card cut to
  "G50…"; two of a kind keep their names. Hovering one shows its model.
- **Hover for the rest:** a label, caption or line on a stats card that is
  cut short shows in full on hover.

### Fixed

- The Stats page counted panels this machine can't show ("10 of 9").

## 1.8.0 — 2026-10-24

### Added

- **Panel pages:** the panel keeps its header, monitor buttons and preview
  on top and shows one page at a time below them: Edges, Fill, Stats and
  Profiles. Click a tab or press `[` and `]`; the edge keys bring up
  Edges, and the panel opens where it was left. It scrolls on a screen
  too short for a page, where the bottom rows used to be cut off.
- **Panel order:** the Stats page lists a monitor's panels in order, with
  buttons to move them, and the rest to add. The dashboard lays them out
  in that order and leaves them off from the end; `panels` over IPC keeps
  the order given.
- **Warning color:** a stats card's outline and title turn red, with a
  warning mark, while one of its sensors is within 5 °C of its limit,
  memory is 90% used, video memory 95%, or tasks stall 10% of the time.
  Batteries, a laptop's or a peripheral's, step up from yellow at 15% to
  red at 10% and a filled title at 5% while not charging. Network and
  Disks have new hues, since red and yellow now mean a warning.
- **Hybrid CPUs:** an Intel CPU's performance and efficient threads show
  as two groups of bars, and the CPU card counts each.
- **Same on every monitor** on the Fill page, which right-click alone
  used to do.
- **The Stats page says what the dashboard draws:** a shown panel that
  doesn't fit the edge, or has nothing to show on this machine, says so,
  Add leaves out panels the machine can't show, and every shown panel has
  a ✕ to hide it.
- **Processes by memory:** the Processes panel ranks programs by memory
  as well as CPU and video memory; a small card keeps the top program of
  each, on a line that names its resource.
- **Battery panel:** a bar of the leading battery's level, the emptiest
  peripheral leading without a laptop battery, a meter and a charging
  mark for each device, a laptop battery's health and cycle count, and
  the warning color for any battery low and draining.
- **GPU names:** AMD and Intel GPUs show their model ("Radeon 610M"
  rather than "Radeon Graphics"), looked up once in libdrm's `amdgpu.ids`
  and hwdata's `pci.ids`.

### Changed

- **Temperatures against their limit:** temperature meters fill from
  30 °C to the sensor's critical temperature (from hwmon, NVMe and amdgpu,
  read by `stats.sh`), or to where the part throttles, instead of a 0 to
  100 °C scale.
- **Memory card:** one bar of used and cached memory keyed by its rows,
  in place of a flat graph and meters for Used and Available, which said
  the same thing twice.
- **Network and Disks graphs** carry no text, which was unreadable over
  a spiky graph: the rates and the peak each graph's top stands for are
  rows, and the Disks peak is in its title.
- **Each reading once:** the Sensors panel leaves out the temperatures
  of the CPU, GPU and iGPU panels on the same dashboard and leads with
  the hottest sensor for its limit; the Disks panel leaves NVMe
  temperatures to Sensors, and System leaves memory and load to their
  panels. Sensors and Battery drop graphs that were flat lines.
- **No empty cards:** an iGPU panel without a second GPU and a Battery
  panel without a battery take no room on the dashboard.
- **Small cards:** in a narrow or wide card the CPU's clock and the load
  average's minutes move or shorten instead of being cut off, and a wide
  System card puts Omarchy's logo beside the facts.
- **Load average** names its minutes where the card is wide enough, with
  a meter for the load per thread.
- **One meter color rule:** every meter that measures closeness to a
  limit runs green, yellow, red.
- **Sensors panel:** Temperatures and Fans are one panel. The Pressure
  panel's numbers are Stalled rows on the CPU, Memory and Disks cards
  while tasks stall. Saved panel lists, profiles and IPC names (`fans`)
  carry over.
- Labels for what was hidden: the pause switch says On or Paused, the
  Idle button names itself, the stats fill's edge choice says what it
  places, and the Profiles page says what Auto does.
- **Aligned cards:** a card's meters start and end together, a value too
  long for one keeps its text whole, and headlines sit at the top of
  every card. A wide Sensors card names its leading sensor under the
  number, and beside the CPU panel a non-CPU sensor leads. Disks with one
  disk names it and gives Read and Write a row each. Network's two totals
  share one row, and its keys match its lines.
- The Profiles field starts with the current profile, so Update and Auto
  work at once; an automatic profile says "auto" on its button. The
  aspect position button reads "Area · Bottom".
- `Stats.js` is split: the layout and the cards live in `StatsViews.js`.

- The README is a short landing page. The manual moved, word for word, to
  guides in `docs/guide/`: the panel, fills, profiles, the stats fill,
  keybinds and scripts, and how it works (with the saved settings and
  known limitations), indexed in `docs/README.md`.

## 1.7.1 — 2026-10-21

### Added

- **Documentation:** a docs index (`docs/README.md`); specs for the
  settings file, the IPC actions and the `stats.sh` frame format; a
  development runbook with the full offscreen render harness, refreshing
  the hero and the release steps; and a troubleshooting runbook.
- **Contributor files:** `CONTRIBUTING.md`, `SECURITY.md` with the full
  privilege model and private reporting, and GitHub issue and pull
  request templates.
- **Brand sources:** `docs/branding.md` with the colours (accent
  `#88a4ad`), dark and light wordmarks, and `docs/brand/preview.svg`, the
  editable source of the README hero, with its offscreen captures.

### Changed

- `preview.png` is now rendered from `docs/brand/preview.svg`, with fresh
  captures made from made-up data; the layout is the same.
- The author is **Mateus Pim** in `manifest.json`, `package.json` and
  `LICENSE`; `.mailmap` maps the old "Mateus Pym" commits.
- The README's security section is shorter and links `SECURITY.md`; its
  Documentation section links the new docs.

## 1.7.0 — 2026-10-19

### Changed

- **Renamed to OmaReach,** after the tagline "Use only the screen you can
  reach", with a new plugin ID and no automatic migration: plugin ID and IPC
  target `pym.omareach` (was `pym.display-reserve`), settings
  `~/.config/omarchy/omareach.json` (was `display-reserve.json`), layer
  namespaces `pym-omareach*`, repository `mateuspim/omareach` (was
  `mateuspim/omarchy-display-reserve`). To move over:

  ```bash
  omarchy plugin remove pym.display-reserve
  mv ~/.config/omarchy/display-reserve.json ~/.config/omarchy/omareach.json
  omarchy plugin add https://github.com/mateuspim/omareach.git --enable --yes
  ```

  Then point keybinds and scripts at `omarchy-shell pym.omareach …`. The CPU
  power udev rule carries over as it is.

## 1.6.1 — 2026-10-18

### Changed

- **New icon:** a monitor with its top and bottom edges reserved and the bar
  between them, in the bar, the panel header, the README and the
  marketplace banner. In the bar it takes the bar's colors, shows its edges
  once the bar's monitor has a reserve, and is struck through while that is
  paused.

## 1.6.0 — 2026-10-18

### Added

- **Stats fill:** a live, btop-style system dashboard on one edge, in
  rounded boxes with history graphs and meters, in the theme's colors.
  Thirteen panels: GPU, iGPU, CPU, Memory, Network, Disks, Processes,
  Temperatures, Pressure, Fans, Battery, Now playing and a fastfetch-like
  System panel. GPU, CPU, Memory and Network are on by default; the panel's
  **Panels** grid (or `panels` / `panel` over IPC) picks the rest. Each card
  shows what fits its size, and the panels tile the edge in the grid that
  gives them the most room.
- **Battery panel:** a laptop's battery with the time left, plus UPower
  peripherals such as Bluetooth headsets and wireless mice.
- **CPU power draw** from the RAPL energy counter, with a meter against the
  CPU's power limit (Intel's PL1, or an AMD desktop's stock PPT). The kernel
  lets only root read the counter, so the **CPU power** button opens a
  terminal that prints the root commands, asks, and runs them with `sudo`
  (or `pkexec`); see [Security and privileges](README.md#security-and-privileges).
  IPC: `cpuPower status|enable|disable`.
- **Animation pace:** the dashboard's graphs and meters move at 30 fps by
  default; the **Animation** button (or `pace`) sets the display's rate,
  60, 30 or 15 fps, or none.

### Changed

- An idle discrete GPU that can power itself down is read less often, so
  the dashboard doesn't keep it awake. A sleeping GPU is never read.
- AMD GPUs are told discrete from integrated by their memory vendor.
- README: a marketplace banner, a Quick start, and **Remove** and
  **Security and privileges** sections. New `docs/architecture.md` and
  decision records in `docs/adr/`.

### Fixed

- **Qt 6.12:** QtQuick's own `Color` shadowed the theme singleton, so the
  theme fill, the logo, the clock and the ruler lost their theme colors.
  Theme colors are now read as `Commons.Color`.

## 1.5.0 — 2026-09-30

### Added

- **Automatic profiles:** **Auto** ties a profile to the monitors connected
  now, and it applies by itself whenever exactly those monitors connect
  again. A shell restart with the same monitors keeps your edits. IPC:
  `autoProfile`.
- **Dim amount:** the dimmed fill's darkness, 10% to 90%, per monitor (IPC
  `dim`).
- **A fill for every monitor:** right-click a fill (or a stats panel) to
  give it to every monitor.

### Fixed

- Of two profiles holding the same settings, the one last applied or saved
  stays selected.

## 1.4.0 — 2026-09-30

### Added

- **Profiles:** save every monitor as it is now under a name and apply it
  later with one click, `1` to `9`, or IPC (`profile`, `saveProfile`,
  `deleteProfile`, `profiles`). Applying or deleting one can be undone.

### Changed

- Less memory and work: the wallpaper fills decode at screen size without
  mipmaps, the spacer surface is one transparent pixel with an explicit
  exclusive zone, and the wallpaper is polled only for connected monitors.

## 1.3.0 — 2026-09-29

### Added

- **Black when idle:** every edge goes black after 30 s, 1 min or 5 min
  without input.
- **IPC** on the target `pym.display-reserve`, through `omarchy-shell`.
- **Aspect presets** (21:9, 16:9, 4:3, 1:1) that reserve the edges leaving a
  reachable area of that shape, at the top, center or bottom.
- **Calibration ruler** from every edge to the middle.
- The model tests run on GitHub Actions.

## 1.2.0 — 2026-09-29

### Added

- **Fullscreen fitting:** a fullscreen window on a monitor with a reserve is
  fitted to the reachable area (Hyprland's fullscreen state `1 2`).

### Changed

- The logo moves a few pixels every 5 minutes against burn-in, and every
  fill goes black under a fullscreen window.

## 1.1.0 — 2026-09-29

### Added

- **Fills** per monitor: Black (the default), Theme, Wallpaper, Dimmed and
  the Omarchy Logo.
- **Clock fill:** a 24-hour clock in big blocky digits on the largest edge,
  or the larger of top and bottom.

## 1.0.0 — 2026-09-29

The first release.

- Reserve any edge of any monitor in pixels, from a bar widget panel with a
  to-scale preview, sliders, pixel fields and keyboard shortcuts.
- The bar and tiled windows stay in the reachable area; black overlay strips
  cover the reserved edges and block the pointer.
- Settings are keyed by the monitor's description, so they follow it across
  connectors. Undo for Clear and zeroed edges.
