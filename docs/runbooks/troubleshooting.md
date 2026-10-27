# Troubleshooting

Symptom, cause, fix. Start with the shell's log, which is safe to read
at any time:

```bash
quickshell log -p /usr/share/omarchy/shell -t 200 | grep -i -E 'omareach|reserve'
```

and with the plugin's own view of things:

```bash
omarchy-shell pym.omareach status
```

## Edges and the bar

**Omarchy's clock, audio or other popouts open inside the black edge.**
They assume the bar sits at the screen edge, and a reserve on the bar's
side pushes it inwards. This is a known limitation; OmaReach's own panel
opens beside the bar. Reserving an edge other than the bar's side
avoids it.

**The edge is smaller than the value I set.** Opposite edges share a
budget of 90% of the screen, so the bar and the panel stay reachable.
Values over it, from a hand edit or after the monitor switched to a
smaller mode, are trimmed when drawn; the file keeps what you wrote
([settings](../specs/settings.md#output-entry)).

**A fullscreen video or game is cropped by the black edge.** Fullscreen
windows ignore exclusive zones, so OmaReach switches a window that goes
fullscreen on a reserved monitor to Hyprland's fullscreen state `1 2`
([ADR 5](../adr/0005-fit-fullscreen-to-the-reachable-area.md)). It reads
`hyprctl -j clients` for that; check that `hyprctl` works. On Hyprland
without the Lua config, the dispatcher acts on the focused window, so a
window that goes fullscreen without focus may be missed: focus it and
toggle fullscreen again.

**The edges go black while a window is fullscreen.** By design: every
fill except the stats dashboard turns black beside a fullscreen window.

**Everything went black after a while.** Black when idle is on (the moon
button, or `idle` over IPC). The next input brings the fills back;
`omarchy-shell pym.omareach idle 0` turns it off.

**Values on a scaled monitor don't match a ruler on the screen.** The
edges are in logical pixels; the panel shows the scale beside them.

## Settings

**A hand edit to `omareach.json` did nothing, or was undone.** Either the
file is not valid JSON (the log says `omareach: invalid state file:` and
the plugin keeps its current state), or the edit landed within 200 ms of
a change made in the panel, which overwrites it. Fix the JSON, or make
the edit again with the panel idle.

**Settings didn't follow the monitor to another port.** They follow the
monitor's Hyprland description. Two connected monitors with the same
description (or one without) are keyed by connector name instead, and
those entries stay on the port
([ADR 2](../adr/0002-key-settings-by-monitor-description.md)).

**An automatic profile didn't apply after a shell restart.** By design: a
restart with the same monitors keeps your edits. It applies when the set
of monitors changes (docking), 1.5 s after the last one connects.

**`No monitor named …` from IPC.** IPC takes connector names (`DP-4`, as
`hyprctl monitors` lists them), `focused` or `all`, not descriptions.

**Settings still under the old name after updating from Display
Reserve.** The 1.7.0 rename does not migrate; follow
[Coming from Display Reserve](../../README.md#coming-from-display-reserve).

## Updating

**The new version doesn't show after `omarchy plugin update`.** The
service stays loaded while plugins reload, so the black edges stay up
from the old version. Restart the shell after a short wait:
`omarchy plugin update pym.omareach --yes && sleep 3 && omarchy restart shell`.

**The shell crashed right after a restart.** Restarting while plugins
are still reloading can crash the old shell on its way out. It comes
back on its own; keep the `sleep` before `omarchy restart shell`.

## Fills

**The wallpaper fill shows the previous wallpaper.** The link
`~/.local/state/omarchy/current/background` is checked every 2 s while a
wallpaper fill shows; it catches up within 2 s.

**The logo fill is empty.** It reads `logo.svg` and `icon.txt` from
`$OMARCHY_PATH` (or `/usr/share/omarchy`); check they exist.

## Stats fill

**The GPU panel says "No GPU found" on a machine with an NVIDIA card.**
`nvidia-smi` is not on `PATH`, or it ran three times without printing
(it cannot reach the driver). Install the NVIDIA
utilities or fix the driver, then restart the shell.

**The GPU shows as asleep or idle and its numbers don't move.** A GPU
the kernel put to sleep is never read, since reading wakes it. A
discrete GPU with runtime power management that showed no load for 5 s
rests: NVIDIA is checked every 10 s, AMD every 10th frame, and the
panel shows the last reading until one finds it busy
([ADR 7](../adr/0007-let-an-idle-dgpu-rest.md)).

**An Intel GPU shows no temperature or power.** Intel GPUs report
neither; load is derived from idle time. Their heat and power are the
CPU's.

**The CPU panel has no power row.** The RAPL counter is root's. Click
**CPU power · Enable** in the panel (shown only when there is a
counter). `omarchy-shell pym.omareach cpuPower status` says `none` (no
counter: ARM, AMD before Zen, most VMs), `locked` or `on`.

**The CPU power terminal says it can't run.**

| Message | Cause | Fix |
| --- | --- | --- |
| `cpu-power.sh enable needs a terminal to show its commands and ask first` | Run without a terminal. | Use the panel button or IPC, which open one. |
| `Neither sudo nor pkexec is installed` | Nothing can run the root commands. | Install sudo, or run the commands by hand ([SECURITY.md](../../SECURITY.md)). |
| `Nothing changed: sudo was cancelled or refused.` | Wrong password or a declined prompt. | Try again. |
| `The commands ran, but the counter reads …` | Another rule or policy changed the counter back. | Check `/etc/udev/rules.d` and `ls -l /sys/class/powercap/*/energy_uj`. |

**The power row shows watts but no meter.** The CPU's limit is unknown:
a laptop, or an AMD model missing from the table in `StatsSystem.js`.

**A wireless mouse or keyboard on a Logitech Bolt receiver shows no
battery.** The kernel's Logitech driver does not support Bolt receivers.
Solaar reads them directly; OmaReach does not.

**NVMe temperatures or a Dell laptop's fans update slowly.** They are
read every 5 s on purpose: reading them wakes the drive or stalls the
CPU in firmware.

**The dashboard is blank for a few seconds.** Rates need two frames, and
the sampler only runs while a monitor shows the stats fill or the panel
previews it. If `stats.sh` exits, the shell starts it again after 5 s.

## Removing

**CPU power is still on after removing the plugin.** Remove the rule by
hand:

```bash
sudo rm -f /etc/udev/rules.d/70-rapl-energy.rules
sudo chmod 0400 /sys/class/powercap/*/energy_uj
```
