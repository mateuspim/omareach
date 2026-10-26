# <img src="icon.svg" alt="" width="32" height="32" align="top"> OmaReach

![OmaReach: the wordmark, the tagline "Use only the screen you can reach.", feature chips and the install command, beside a portrait monitor whose top edge shows a btop-style dashboard (GPU, CPU, memory and network) above a terminal running omarchy-shell pym.omareach commands, and the plugin's panel for DP-4 on its Stats page, with GPU, CPU, Memory and Network shown in order and the other panels to add](preview.png)

**Use only the screen you can reach.** OmaReach blacks out monitor edges you
can't reach (the top of a tall rotated monitor, a strip behind a bezel or a
shelf) and keeps the Omarchy bar and tiled windows in the area you can. The
edges can stay black, or show the theme color, the wallpaper, the Omarchy
logo, a clock or a live btop-style system dashboard.

## Quick start

1. Install and enable it:
   `omarchy plugin add https://github.com/mateuspim/omareach.git --enable --yes`.
2. Click the new monitor icon on the right of the bar.
3. Pick the monitor, then drag its edge in the preview (or type the pixels)
   until the bar sits where you can reach it. The **Ruler** button shows
   which pixel is the first one you can see.
4. Choose a **Fill**, and save the setup as a profile if you switch between
   several.

## Features

- **Any edge, in pixels:** drag an edge in a to-scale preview, type exact
  pixels, or pick an aspect preset (21:9, 16:9, 4:3, 1:1). Changes apply live,
  without editing `monitors.lua` or reloading Hyprland.
  [The panel](docs/guide/panel.md)
- **Fills:** black (safe on OLED), the theme color, the wallpaper slice
  (plain or dimmed), the Omarchy logo, a big blocky clock (24- or
  12-hour, with the date where it fits), or a live
  **stats dashboard** with 11 panels in the order you choose: GPU, CPU,
  memory, network (with the VPN you're on and where it comes out, and
  Tailscale's peers), disks, sensors, battery, now playing and more, with
  meters against each part's own limit and a warning color you can see
  from across the room.
  [Fills](docs/guide/fills.md) · [The stats fill](docs/guide/stats-fill.md)
- **Profiles:** save every monitor under a name, apply it with `1` to `9`,
  or let it apply by itself when that set of monitors connects.
  [Profiles](docs/guide/profiles.md)
- **Fullscreen that fits:** videos and games fill the reachable area instead
  of being cropped by the black edge.
  [How it works](docs/guide/how-it-works.md)
- **OLED care and calibration:** black when idle, fills that move against
  burn-in, and a ruler to find exactly where the reachable area starts.
- **Keyboard and scripts:** every page of the panel works from the
  keyboard, and every action over IPC, through `omarchy-shell pym.omareach`.
  [Keybinds and scripts](docs/guide/keybinds-and-scripts.md)

## Install

```bash
omarchy plugin add https://github.com/mateuspim/omareach.git --enable --yes
```

A monitor icon appears on the right of the bar. To put it elsewhere, run
`omarchy plugin enable pym.omareach --section left` (or `center`).

To update, pull the new version and restart the shell. The black edges stay
up while plugins reload, so the new version only takes over after a restart:

```bash
omarchy plugin update pym.omareach --yes && sleep 3 && omarchy restart shell
```

Keep the `sleep`: restarting while the shell is still reloading plugins can
crash the old shell on its way out. It comes back on its own, but there's no
reason to trigger it.

### Coming from Display Reserve

OmaReach was called Display Reserve (`pym.display-reserve`) before 1.7.0. The
rename came with a new plugin ID and settings file and no automatic
migration, so move over by hand:

```bash
omarchy plugin remove pym.display-reserve
mv ~/.config/omarchy/display-reserve.json ~/.config/omarchy/omareach.json
omarchy plugin add https://github.com/mateuspim/omareach.git --enable --yes
omarchy restart shell
```

Keybinds and scripts that call `omarchy-shell pym.display-reserve …` now call
`omarchy-shell pym.omareach …`. If you turned on **CPU power**, nothing
changes: its udev rule's file name never had the plugin's name in it.

## Remove

If you turned on **CPU power** in the
[stats fill](docs/guide/stats-fill.md#cpu-power), turn it off first (click
**CPU power · On** in the panel, or
`omarchy-shell pym.omareach cpuPower disable`), which removes its udev
rule. Then remove the plugin:

```bash
omarchy plugin remove pym.omareach
```

Every reserved edge goes away with it. Your saved reservations and profiles
stay on disk; to delete them too:

```bash
rm -f ~/.config/omarchy/omareach.json
```

If you removed the plugin with CPU power still on, take its rule back by
hand:

```bash
sudo rm -f /etc/udev/rules.d/70-rapl-energy.rules
sudo chmod 0400 /sys/class/powercap/*/energy_uj
```

## Security and privileges

OmaReach runs as your user inside the Omarchy shell. Loading it installs
nothing, writes only `~/.config/omarchy/omareach.json`, never edits your
Hyprland config, and uses no network. The one root action is the stats
fill's [**CPU power**](docs/guide/stats-fill.md#cpu-power) button, which
opens a terminal that prints its fixed commands, asks, and runs them with
`sudo`. [SECURITY.md](SECURITY.md) lists every command it runs and file it
reads, and how to report a vulnerability.

## Requirements

- Omarchy 4 with its Quickshell bar and shell plugins (tested on 4.0.4
  with Hyprland 0.56).
- Optional, for the stats fill: `nvidia-smi` (from the NVIDIA driver) for an
  NVIDIA GPU's panel. AMD and Intel GPUs, and everything else, are read from
  `/proc` and `/sys`.

## Documentation

- [Documentation index](docs/README.md): guides, architecture, decisions,
  specs and runbooks.
- Guides: [the panel](docs/guide/panel.md), [fills](docs/guide/fills.md),
  [profiles](docs/guide/profiles.md),
  [the stats fill](docs/guide/stats-fill.md),
  [keybinds and scripts](docs/guide/keybinds-and-scripts.md) and
  [how it works](docs/guide/how-it-works.md).
- [Troubleshooting](docs/runbooks/troubleshooting.md).
- [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).
- [Changelog](CHANGELOG.md).

## Development

The installed plugin, `~/.config/omarchy/plugins/pym.omareach`, is a git
checkout of this repository: switch it to a branch and restart the shell to
try it. Run `npm test` and `omarchy plugin validate .`; [AGENTS.md](AGENTS.md)
has the conventions, and the [development runbook](docs/runbooks/development.md)
how to render the fills and the panel offscreen and how to release.

## License

MIT. See [LICENSE](LICENSE).
