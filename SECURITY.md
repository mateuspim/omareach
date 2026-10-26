# Security

## Reporting a vulnerability

Please report privately through GitHub's
[security advisories](https://github.com/mateuspim/omareach/security/advisories/new)
rather than a public issue. Include the version (`manifest.json`), steps to
reproduce and impact. You can expect a reply within a week.

## Supported versions

Only the latest release on `master` receives fixes.

## Privilege model

Omarchy plugins run unsandboxed inside `omarchy-shell` as your user.
Loading OmaReach installs nothing and writes only its own settings file.
This is what it does with that access:

- **Runs:** `hyprctl -j clients` on fullscreen events, to fit fullscreen
  windows to the reachable area; `readlink -f` on the wallpaper link every
  2 s while a wallpaper fill shows; `bash cpu-power.sh status` to see
  whether the CPU's power draw can be read; and, only while the stats fill
  shows (or the panel previews it), `stats.sh` (bash builtins reading
  `/proc` and `/sys`, and `getconf PAGESIZE` once at start), `nvidia-smi` where it is installed, and,
  only while the Stats page's **Mesh addresses** switch is on and a tunnel
  is up, `ip -o -4 addr show` every 10 s for the tunnels' addresses; and,
  while a VPN or mesh tunnel is up, `vpn.sh` every 10 s, which reads the
  Proton app's cache and runs the status command of the clients whose
  tunnels are up, read-only: `tailscale status --json`, `nordvpn status`,
  `mullvad status`, `piactl get`, `ivpn status`, `windscribe-cli status`,
  `expressvpnctl get` or `expressvpn status`. CPU power
  opens `omarchy-launch-floating-terminal-with-presentation` (below). The commands
  and their arguments are fixed; none is built from settings or IPC input.
- **Reads:** `/proc` and `/sys` counters for the stats fill (sensors of a
  device the kernel put to sleep are skipped, since reading wakes it),
  including which VPN or mesh tunnels are up (`/sys/class/net`,
  `/proc/net/if_inet6`), the Proton VPN app's
  `~/.cache/Proton/VPN/connection/connection_persistence.json` and
  `serverlist.json` for its server and city,
  pacman's database and `/etc/os-release` for the System panel, libdrm's
  `amdgpu.ids` and hwdata's `pci.ids` for GPU names, the
  wallpaper through `~/.local/state/omarchy/current/background`, the
  theme's `colors.toml`, Omarchy's `logo.svg` and `icon.txt`, and the
  shell's MPRIS players and UPower devices. The Now playing panel shows
  local cover files only; it ignores remote artwork URLs from players.
- **Writes:** `~/.config/omarchy/omareach.json`, and nothing else on its
  own. Edges are reserved with layer-shell surfaces; it never edits
  `~/.config/hypr/monitors.lua` or runs `hyprctl reload`.
- **Root:** never on its own. The stats fill's **CPU power** button (shown
  only on CPUs with a RAPL energy counter, also `cpuPower enable|disable`
  over IPC) opens a floating terminal running `cpu-power.sh`. It prints the
  exact commands, asks, and runs them with `sudo`, which asks for your
  password in that terminal (or `pkexec` where there is no sudo). The
  commands are fixed and take no input:

  ```bash
  # enable
  printf '%s\n' 'SUBSYSTEM=="powercap", ACTION=="add", RUN+="/bin/chmod a+r /sys%p/energy_uj"' > /etc/udev/rules.d/70-rapl-energy.rules
  chmod a+r /sys/class/powercap/*/energy_uj
  # disable
  rm -f /etc/udev/rules.d/70-rapl-energy.rules
  chmod 0400 /sys/class/powercap/*/energy_uj
  ```

  The kernel keeps the counter from other users because watching it
  closely enough can leak what another program computes (Platypus,
  CVE-2020-8694). Enabling lets every local user read it; on a desktop
  with one user that gives little away. Disable it before removing the
  plugin, or run the disable commands by hand
  ([ADR 8](docs/adr/0008-cpu-power-through-a-visible-terminal.md)).
- **Network:** none. It downloads and runs nothing from the internet.
- **Secrets:** none.
- **Text:** every plugin `Text` renders plain text, so track metadata,
  profile names and other outside strings can't load images through
  markup (`tests/qml.test.js` checks this).

It never changes configuration outside its own files on load.
