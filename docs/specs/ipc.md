# IPC actions

`Service.qml` registers a Quickshell `IpcHandler` on the target
`pym.omareach`. Call it through Omarchy's wrapper:

```bash
omarchy-shell pym.omareach <action> [arguments]
```

Every action answers with plain text on stdout, except `status`, which
answers with JSON. Errors are answers too (the call itself succeeds), so a
script should read the text. The
[Keybinds and scripts](../guide/keybinds-and-scripts.md) guide is the
user-facing summary; this page is the exact behaviour.

## Arguments

- **Monitor**: a connector name such as `DP-4`; `""` or `focused` for
  Hyprland's focused monitor; `all` for every connected monitor. Unknown
  names answer `No monitor named <name>`; no focused monitor answers
  `No focused monitor`.
- **Integers** (`pixels`, `percent`, `seconds`, `fps`) are typed `int` in
  the handler; pass whole numbers.
- Actions that take a monitor answer one line per monitor:
  `<connector>  ·  <message>`, where the message is an action's note or
  error, or else the monitor's summary such as `Top 660 px  ·  Stats`
  (`Paused  ·  …` while paused, `No reserved edges` with none).

## Actions

| Action | Arguments | Effect and answer |
| --- | --- | --- |
| `status` | none | JSON, below. |
| `toggle` | monitor | Pause or resume. `No reserved edges` for a monitor with none. |
| `pause`, `resume` | monitor | Pause, resume; same answers as `toggle`. |
| `fill` | monitor, fill | Fill by key or label, ignoring case: `black`, `theme`, `logo`, `wallpaper`, `dim` (or `dimmed`), `clock`, `stats`. Unknown: `Unknown fill <x>; one of black, theme, logo, wallpaper, dim, clock, stats`. Without reserved edges it still sets the fill and answers `<Fill>  ·  no reserved edges to show it`. |
| `nextFill` | monitor | The next fill in the order above, wrapping. |
| `dim` | monitor, percent | Dimmed fill's darkness, clamped to 10 to 90. Answers `Dim <n>%`. |
| `clockHours` | monitor, hours | The clock fill's hours, `12` or `24`. Answers `Clock  ·  <n>-hour`; other numbers `Say 12 or 24`. |
| `clockDate` | monitor, `on` or `off` | The date under or beside the clock, where the edge has room for it. Answers `Clock date  ·  on` or `off`; other states `Say on or off`. |
| `panels` | monitor, list | Stats panels as a comma list, in the order the dashboard shows them, `all`, or `none` (or `""`). Names are keys, labels or aliases (below). Unknown: `Unknown panel in <list>; one of …`. Answers `Stats: <names>`, plus `  ·  shown with the stats fill` when the monitor's fill is not `stats`. |
| `panel` | monitor, panel, state | One panel `on` (it goes last), `off`, or `""` to flip it. Other states: `Say on or off`. Answers as `panels`. |
| `edge` | monitor, side, pixels | `top`, `bottom`, `left` or `right`, clamped to 0 and the side's budget (90% of the axis, less the opposite edge). Unknown side: `Unknown edge <x>; one of top, bottom, left, right`. |
| `aspect` | monitor, ratio, place | Reserve the pair of edges that leaves a reachable area of `ratio` (`16:9`, `16/9`, `16x9` or `1.78`). Place: `top`/`left`/`start`, `center`/`middle`, `bottom`/`right`/`end`, or `""` to keep the place read off the current edges. Errors: `Unknown aspect <x>; for example 16:9`, `Unknown alignment <x>; top, left, center, bottom or right`. Re-enables a paused monitor. |
| `ruler` | monitor | Show or hide the ruler; it shows on one monitor at a time. Answers `Ruler on <connector>` or `Ruler off`; `all` with more than one monitor connected answers `The ruler shows on one monitor at a time`. |
| `idle` | seconds | Black when idle after `seconds`; `0` (or a negative) turns it off. Answers `Black when idle: Off`, `30 s`, `1 min`, `5 min` and so on. |
| `pace` | fps | Dashboard animation, 0 to 240; out of range resets to 30. Answers `Dashboard animation: Display rate`, `No animation` or `<n> fps`. |
| `cpuPower` | `status`, `enable`, `disable` or `""` | `status` (or `""`) answers the last check (`none`, `locked`, `on`, or `unknown` before the first check finishes) and starts a new one. `enable` and `disable` open a floating terminal running `cpu-power.sh` and answer `Opened a terminal to <action> the CPU's power draw`; nothing runs as root until the user confirms there. Other values: `Unknown action <x>: use status, enable or disable`. |
| `profile` | name | Apply a profile to every monitor. Answers `Profile <name>` and then one summary line per monitor; unknown: `No profile named <x>; one of <names>` (or `; none saved yet`). |
| `saveProfile` | name | Save every monitor under `name`, replacing a profile of that name in any case. Answers `Saved profile <name>`, or `A profile needs a name`. |
| `deleteProfile` | name | Answers `Deleted profile <name>` or the unknown-profile message. Also unties it from automatic use. |
| `autoProfile` | name, `on` or `off` | `on` ties the profile to the monitors connected now (`<name> applies by itself with <keys>`); `off` unties it (`<name> no longer applies by itself`). Other states: `Say on or off`. |
| `profiles` | none | One line per profile, sorted by name; the current one starts with `* `, others with two spaces; tied ones end with `  ·  auto with <keys>`. `No profiles` when there are none. |

Panel aliases (`Model.PANEL_ALIASES`): `mem`, `ram` → memory; `net` →
network; `disk`, `io` → disks; `procs`, `top processes` → processes;
`integrated` → igpu; `temperatures`, `temp`, `sensors`, `fan`, `fans` →
temps (the Sensors panel); `bat` → battery; `music`, `mpris`,
`nowplaying` → media; `uptime` → system. Labels such as `Now playing`
work too.

Profile names follow the [settings rules](settings.md#profiles): trimmed,
at most 32 characters, matched exactly and then ignoring case.

## `status` JSON

```json
{
  "idleBlack": 0,
  "idle": false,
  "statsPace": 30,
  "ruler": "",
  "profile": "Desk",
  "profiles": ["Desk", "Gaming"],
  "autoProfiles": { "Desk": ["DP-5", "Dell Inc. DELL U2720Q 1A2B3C4"] },
  "monitors": ["DP-5", "Dell Inc. DELL U2720Q 1A2B3C4"],
  "outputs": {
    "DP-4": { "enabled": true, "fill": "stats", "clockEdge": "largest", "clockHours": 24, "clockDate": false, "dim": 60, "panels": ["gpu", "cpu", "memory", "network"], "top": 660, "bottom": 0, "left": 0, "right": 0 }
  }
}
```

- `idle`: whether the session is idle right now (and the edges black).
- `ruler`: the connector showing the ruler, or `""`.
- `profile`: the profile matching the screen, or `""`.
- `monitors`: the storage keys of the connected monitors.
- `outputs`: every connected monitor by **connector name**, with its
  normalized stored entry (a paused monitor keeps its edges here).

## `cpu-power.sh`

The script behind `cpuPower`, also usable by hand from the plugin folder:

| Call | Does |
| --- | --- |
| `cpu-power.sh status` | Prints `none` (no RAPL counter), `locked` (root's) or `on` (readable). |
| `cpu-power.sh commands enable\|disable` | Prints the root commands that action runs. |
| `cpu-power.sh runner` | Prints `sudo`, or `pkexec` where there is no sudo, or nothing when neither is installed. |
| `cpu-power.sh enable\|disable` | Shows the commands, asks, runs them as root. Needs a terminal on stdin and stdout. |

Usage errors exit 2 with a usage line on stderr. `CPU_POWER_SYSFS`
overrides `/sys/class/powercap` for tests.
