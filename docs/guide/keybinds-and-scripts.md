# Keybinds and scripts

Drive OmaReach from a terminal, a script or a Hyprland key binding. The
[IPC spec](../specs/ipc.md) has every action's exact behaviour and answers.

The shell answers IPC calls on the target `pym.omareach`, through
`omarchy-shell`. For the calls that take one, the first argument names the monitor: a connector such as
`DP-4`, `""` or `focused` for the focused monitor, or `all`.

| Call | Does |
| --- | --- |
| `status` | Every monitor's settings, as JSON |
| `toggle <monitor>` | Pause or resume |
| `pause <monitor>`, `resume <monitor>` | Pause, resume |
| `fill <monitor> <fill>` | Set the fill: `black`, `theme`, `logo`, `wallpaper`, `dim`, `clock` or `stats` |
| `panels <monitor> <list>` | The stats panels, as a comma list such as `gpu,cpu,memory`, or `all` or `none` |
| `panel <monitor> <panel> <on\|off\|"">` | Show or hide one stats panel; `""` switches it over |
| `nextFill <monitor>` | Next fill, as `f` in the panel |
| `dim <monitor> <percent>` | How dark the dimmed fill is, 10 to 90 |
| `clockHours <monitor> <12\|24>` | The clock fill in 12- or 24-hour time |
| `clockDate <monitor> <on\|off>` | The date under the clock, where the edge is tall enough |
| `edge <monitor> <side> <pixels>` | Reserve `pixels` on `top`, `bottom`, `left` or `right` |
| `aspect <monitor> <ratio> <place>` | An aspect preset: `16:9`, `4:3`, any `w:h`; `top`, `left`, `center`, `bottom`, `right`, or `""` to keep the current place |
| `ruler <monitor>` | Show or hide the ruler |
| `idle <seconds>` | Black when idle after `seconds`; `0` turns it off |
| `pace <fps>` | Frames a second the dashboard's graphs and meters move at, up to 240; `0` the display's rate, `1` no animation |
| `cpuPower <status\|enable\|disable>` | Whether the CPU's power draw can be read (`none`, `locked` or `on`); `enable` and `disable` open a terminal that shows the root commands and asks first |
| `profile <name>` | Apply a profile to every monitor |
| `saveProfile <name>` | Save every monitor as profile `name`, replacing one of that name |
| `deleteProfile <name>` | Delete a profile |
| `autoProfile <name> <on\|off>` | Apply a profile by itself whenever the monitors connected now connect, or stop |
| `profiles` | List the profiles, the one on screen marked `*` |

For example, from a terminal:

```bash
omarchy-shell pym.omareach fill DP-4 clock
omarchy-shell pym.omareach fill DP-4 stats
omarchy-shell pym.omareach panels DP-4 gpu,cpu,processes
omarchy-shell pym.omareach aspect DP-4 16:9 bottom
omarchy-shell pym.omareach profile Gaming
```

Profile names are matched ignoring case.

To pause the focused monitor with Super+Alt+P and cycle its fill with
Super+Alt+Shift+P, add to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + ALT + P", "Pause OmaReach", "omarchy-shell pym.omareach toggle focused")
o.bind("SUPER + ALT + SHIFT + P", "Next reserve fill", "omarchy-shell pym.omareach nextFill focused")
```
