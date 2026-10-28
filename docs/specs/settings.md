# Settings file

OmaReach keeps everything it remembers in one JSON file,
`~/.config/omarchy/omareach.json`. `ReserveState.qml` reads, writes and
watches it; `Model.js` normalizes every value read from it. This page is
the contract for that file, taken from the code.

## Example

```json
{
  "outputs": {
    "Dell Inc. DELL U2720Q 1A2B3C4": {
      "enabled": true, "top": 660, "bottom": 0, "left": 0, "right": 0,
      "fill": "stats", "clockEdge": "largest", "clockHours": 24, "clockDate": false, "clockSeconds": "off", "dim": 60,
      "panels": ["clock", "gpu", "cpu", "memory", "network"]
    },
    "DP-5": { "enabled": false, "top": 0, "bottom": 0, "left": 0, "right": 120 }
  },
  "idleBlack": 60,
  "statsPace": 0,
  "statsTunnelAddress": true,
  "statsZones": ["Asia/Tokyo", "Europe/Lisbon"],
  "statsLocation": { "lat": 38.72, "lon": -9.14 },
  "profiles": {
    "Desk": { "Dell Inc. DELL U2720Q 1A2B3C4": { "enabled": true, "top": 660, "bottom": 0, "left": 0, "right": 0, "fill": "stats", "clockEdge": "largest", "clockHours": 24, "clockDate": false, "dim": 60, "panels": ["gpu", "cpu", "memory", "network"] } }
  },
  "autoProfiles": { "Desk": ["Dell Inc. DELL U2720Q 1A2B3C4", "DP-5"] },
  "monitors": ["DP-5", "Dell Inc. DELL U2720Q 1A2B3C4"]
}
```

## Top level

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `outputs` | object | `{}` | One entry per monitor, by [monitor key](#monitor-keys). |
| `idleBlack` | integer seconds | `0` (left out) | Every edge goes black after this long without input; `0` never. The panel offers 0, 30, 60 and 300; any whole number works. |
| `statsPace` | integer 0 to 240 | `30` (left out) | Frames a second the dashboard's graphs and meters move at; `0` follows the display's refresh rate, `1` is no animation. Anything outside 0 to 240, or not a whole number, reads as 30. |
| `statsTunnelAddress` | boolean | `false` (left out) | The Network card shows a mesh's (Tailscale's) IPv4 address on its row, ahead of the peers online. Anything but `true` reads as `false`. |
| `statsZones` | array of strings | left out when empty | The Clock panel's other time zones, IANA names such as `Asia/Tokyo` (`Clock.zoneList`): names shaped like tzdata's (letters, digits, `_`, `+`, `-`, separated by `/`; never `..` or a leading `/`), each once, at most three, in the order given. Anything but an array is none. |
| `statsLocation` | object | left out when null | `{ "lat", "lon" }` in degrees, where the Clock panel works out sunrise and sunset (`Clock.location`): rounded to two places; out of range (±90, ±180), missing or not numbers reads as null, which shows no sun. |
| `profiles` | object | left out when empty | Profile name to a map of entries, shaped like `outputs`. |
| `autoProfiles` | object | left out when empty | Profile name to the sorted list of monitor keys it applies with. |
| `monitors` | array of strings | left out when empty | The monitor keys connected when the file was last saved. |

Keys the plugin does not know are dropped on the next save.

## Monitor keys

An entry is keyed by the monitor's Hyprland description (make, model and
serial, as in `hyprctl monitors`) when it is non-empty and no other
connected monitor shares it, and by the connector name (`DP-4`) otherwise
(`Model.outputKeys`, [ADR 2](../adr/0002-key-settings-by-monitor-description.md)).
An entry stored under a connector name is still read, and moves to the
description key on the next edit of that monitor.

## Output entry

Every field is optional; `Model.normalize` fills in the rest.

| Field | Type | Default | Normalization |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Only `false` pauses the monitor. A paused entry keeps its values but reserves nothing. |
| `top`, `bottom`, `left`, `right` | integer logical pixels | `0` | Rounded, negatives and non-numbers become 0. |
| `fill` | string | `"black"` | One of `black`, `theme`, `logo`, `wallpaper`, `dim`, `clock`, `stats`; anything else is `black`. |
| `clockEdge` | string | `"largest"` | `largest` or `topBottom`: where the clock and stats fills go. |
| `clockHours` | integer | `24` | `24` or `12`; anything else is `24`. The 12-hour clock has no leading zero and no AM or PM. |
| `clockDate` | boolean | `false` | Only `true` turns it on: the date under the clock, or beside it on a short wide edge, whichever keeps the clock bigger; left out where neither keeps 70% of the time's size (judged for the widest time, so it does not come and go during the day). |
| `clockSeconds` | string | `"off"` | `off`, `blink` (the colon blinks, on a one-line time) or `bar` (a bar under the time fills over the minute); anything else is `off`. |
| `dim` | integer percent | `60` | Rounded and clamped to 10 to 90; a non-number is 60. |
| `panels` | array of strings | `["gpu", "cpu", "memory", "network"]` | Known panel names only, each once, in the order given, which is the order the dashboard lays them out and drops them from the end when the strip runs out of room. The names are `gpu`, `igpu`, `cpu`, `memory`, `network`, `disks`, `processes`, `temps` (the Sensors panel), `battery`, `media`, `system`, `clock`. 1.7's `fans` reads as `temps` and its `pressure` is dropped, since their numbers moved to Sensors and to the CPU, Memory and Disks panels. Anything but an array is the default; `[]` is a dashboard with no panels. |

The edges are stored as set, but drawn within a budget (`Model.fit`):
opposite edges together reserve at most 90% of that axis. The first edge
of each pair (`top`, `left`) keeps what fits and the second gets the
rest. Values over the budget, such as after a switch to a smaller mode,
are trimmed when drawn, not rewritten.

Clear removes the edges but keeps `fill`, `clockEdge`, `clockHours`,
`clockDate`, `clockSeconds`, `dim` and `panels`;
an entry left with only default values is removed.

## Profiles

- A name is trimmed, runs of whitespace become one space, and it is cut
  to 32 characters; an empty name is no profile.
- Lookups (`profile`, `deleteProfile` and the like) try the exact name,
  then the same name ignoring case.
- A profile holds normalized entries; default entries are left out, and
  a value that is not an object is dropped on read.
- Applying a profile makes `outputs` exactly that map. The profile that
  matches `outputs` is the current one; when several match, the one last
  applied or saved wins, then the first by name.

## Automatic profiles

`autoProfiles` ties a profile to a set of monitor keys. When the connected
set settles (1.5 s after the last change) and differs from `monitors`, the
plugin stores the new set and applies the profile tied to it, if any.
Entries that name a missing profile or an empty set are dropped on read,
and tying a second profile to the same set unties the first. A shell
restart with the same monitors applies nothing, so edits made since the
profile was applied survive.

## Reading and writing

- Writes are debounced by 200 ms and atomic (written beside the file,
  then renamed over it), as JSON indented by two spaces with a trailing
  newline. The panel flushes a pending write when it closes.
- The file is watched. A hand edit applies at once; one made within
  200 ms of a change in the panel is overwritten by that change.
- The plugin's own writes come back through the watcher; a reload whose
  text matches one written in the last 3 s is ignored.
- An empty file is ignored (a writer that truncates first). Invalid JSON
  keeps the current state and logs `omareach: invalid state file: <error>`.
- A missing or deleted file resets everything to the defaults.

The CPU power rule (`/etc/udev/rules.d/70-rapl-energy.rules`) is not part
of this file; see [SECURITY.md](../../SECURITY.md).
