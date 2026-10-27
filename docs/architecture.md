# OmaReach architecture

OmaReach is an Omarchy shell plugin: QML loaded into Omarchy's
Quickshell, plus two bash scripts. This page is how the parts fit together
today; the [decision records](adr/README.md) say why. The
[guides](guide/) are the user manual.

## Entry points

`manifest.json` names two entry points, both loaded by the shell:

| Kind | File | Does |
| --- | --- | --- |
| `service` | `Service.qml` | The layer surfaces for every reserved edge, fullscreen fitting, black when idle, the ruler and the IPC handler. `keepLoaded` keeps it up while plugins reload. |
| `barWidget` | `Panel.qml` | The bar icon and its popout panel. Any number of bar instances share one state. |

## Components and data flow

```
omareach.json ⇄ ReserveState (singleton) ──► Service ──► spacer + cap surfaces ──► ReserveFill
                              ▲      │                │                                     │
                     Panel ───┘      │                └─ fullscreen fitting (hyprctl, dispatch)
                     IPC  ───────────┘                                                      ▼
                                     └─► StatsSampler ◄── stats.sh, vpn.sh, nvidia-smi       StatsFill ─► StatsCard
```

- **`ReserveState.qml`** (singleton) holds every monitor's settings,
  profiles and session settings, reads and writes
  `~/.config/omarchy/omareach.json`, and watches it for hand edits.
  It keeps `outputs` (what the user set) and `applied` (what is on screen),
  which trails it by up to 100 ms and holds during drags
  ([ADR 3](adr/0003-throttle-applied-state.md)). It also owns the shared
  helpers: the wallpaper link, the Omarchy logo, the stats sampler and the
  CPU power status.
- **`Model.js`** is the pure logic, without QML: normalizing entries,
  which edge a fill shows on, stats panels, the panel's pages and
  fullscreen fitting. Beside it, **`ModelEdges.js`** has limits and
  budgets, aspect presets and the ruler; **`ModelProfiles.js`** storage
  keys ([ADR 2](adr/0002-key-settings-by-monitor-description.md)),
  profiles and automatic profiles; **`ModelArt.js`** the clock and logo
  layouts. Node tests them.
- **`Service.qml`** makes two layer surfaces per reserved edge: a
  Bottom-layer spacer whose exclusive zone reserves the edge, and an
  Overlay-layer cap that draws the fill
  ([ADR 1](adr/0001-exclusive-zones-not-monitors-lua.md)). It fits fullscreen
  windows to the reachable area
  ([ADR 5](adr/0005-fit-fullscreen-to-the-reachable-area.md)), turns every
  edge black while idle, and answers `omarchy-shell pym.omareach …`.
- **`Panel.qml`** is the bar widget: the bar button and its card, with
  the header, monitor buttons, preview, page tabs, idle, ruler and undo,
  the edit functions the pages call and the keyboard shortcuts. Edits go
  to `ReserveState`. **`PanelPreview.qml`** is the to-scale preview with
  its draggable edges, and the pages are **`PanelEdgesPage.qml`** (edge
  sliders and fields, aspect presets), **`PanelFillPage.qml`** (fills, dim,
  the clock's edge), **`PanelStatsPage.qml`** (the dashboard's panels and
  their order, animation, CPU power) and **`PanelProfilesPage.qml`**. Each
  takes the Panel as `panel`.
- **`ReserveFill.qml`** draws one edge's fill (black, theme, wallpaper,
  dimmed, logo, clock or stats) for both the caps and the panel's preview.
  The logo recolors the SVG's text, and the clock is blocks from
  `Model.clockLayout`. Both move a few pixels every 5 minutes against burn-in.
- **`Ruler.qml`** is the calibration ruler, a click-through Overlay surface.
- **`ReserveIcon.qml`** draws `icon.svg` with Shapes in the bar's colors, for
  the bar button and the panel header.

## The stats fill

- **`stats.sh`** prints a frame of `/proc` and `/sys` counters every second
  with bash builtins only, and a process list every third frame while the
  Processes panel is shown
  ([ADR 6](adr/0006-one-builtin-only-stats-sampler.md)).
- **`StatsSampler.qml`** (one instance, in `ReserveState`) runs `stats.sh`
  and, on NVIDIA, one `nvidia-smi -lms`, plus sysfs reads for AMD and Intel
  GPUs. It runs only while a monitor shows the stats fill or a panel
  previews it, pauses while idle, lets an idle dGPU rest
  ([ADR 7](adr/0007-let-an-idle-dgpu-rest.md)), and adds the shell's MPRIS
  players and UPower devices. Its clock ticks at the animation pace. While a
  VPN or mesh tunnel is up it runs `vpn.sh` every 10 s and lays where each
  goes over the frames.
- **`Stats.js`** is the pure data side: frames and `nvidia-smi` lines into
  one state, counters into rates, history. It imports the parsers:
  **`StatsProc.js`** (frame sections, CPU, memory, disks, pressure,
  processes), **`StatsNet.js`** (interfaces, VPNs, meshes),
  **`StatsSystem.js`** (sensors, names, batteries, player, CPU power) and
  **`StatsGpu.js`** (NVIDIA, DRM cards, which GPU is which).
  **`StatsFormat.js`** has the theme's palette from `colors.toml`, heat
  levels and the text form of numbers. The pure drawing side is
  **`StatsTiles.js`**, how panels tile a strip (`Tiles.fit`),
  **`StatsViews.js`**, the rows each panel shows at a given size, and
  **`StatsRows.js`**, the rows, warning levels and headline fitting the
  panels share.
- **`StatsFill.qml`** lays out the grid; **`StatsCard.qml`** draws one
  panel; **`StatsGraph.qml`** the scrolling history graphs;
  **`StatsEase.qml`** eases meters between samples. A card's rows are
  **`StatsRow.qml`**, its hover tips **`StatsTip.qml`** and the Now playing
  panel's track **`StatsMedia.qml`**.
- **`vpn.sh`** asks the clients whose tunnels are up where they go: Proton's
  server and city from its app's cache, `tailscale status --json`,
  `nordvpn status`, `mullvad status`, `piactl get`, `ivpn status`,
  `windscribe-cli status` and ExpressVPN's CLI; for a plain `tun0`, each
  installed client that may own it.
- **`cpu-power.sh`** reports whether the CPU's RAPL counter can be read and,
  from a visible terminal, opens or closes it as root
  ([ADR 8](adr/0008-cpu-power-through-a-visible-terminal.md)).

## Storage

| What | Where |
| --- | --- |
| Monitors, profiles, automatic profiles, idle, animation pace | `~/.config/omarchy/omareach.json` |
| The CPU power rule, only if you enable it | `/etc/udev/rules.d/70-rapl-energy.rules` |

Nothing else is written. The wallpaper is read through
`~/.local/state/omarchy/current/background`, and theme colors through
`qs.Commons` ([ADR 9](adr/0009-qualify-theme-color-for-qt-6-12.md)) and the
theme's `colors.toml`.

## Tests

`npm test` runs the Node tests in `tests/`: a `model*.test.js` per model script,
a `stats*.test.js` per stats script, `sampler.test.js` (stats.sh frames) and
`cpupower.test.js` (cpu-power.sh against a fake sysfs). GitHub Actions runs
the same on every push. UI is checked in an offscreen harness, never on the
live screens ([ADR 4](adr/0004-offscreen-render-harness.md)).
