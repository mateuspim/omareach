# Development runbook

## Prepare a checkout

OmaReach needs Omarchy 4 with its Quickshell bar and shell plugins, Node
22 for the tests (CI uses 22), and `bash`. There is no build step and no
npm dependency.

The installed plugin, `~/.config/omarchy/plugins/pym.omareach`, is a git
checkout of this repository. To work on it:

```bash
omarchy plugin add https://github.com/mateuspim/omareach.git --enable --yes
cd ~/.config/omarchy/plugins/pym.omareach
git switch -c my-change
```

Edit there (or pull a branch into it), then restart the shell to load the
change. Restart only when you mean to: the shell reloads every plugin, and
restarting while it is still reloading can crash the old shell on its way
out, so wait a few seconds after a plugin update:

```bash
omarchy restart shell
```

Read the live log without touching the shell:

```bash
quickshell log -p /usr/share/omarchy/shell -t 200 | grep -i reserve
```

## Run the tests

```bash
npm test                     # every tests/*.test.js; CI runs the same
omarchy plugin validate .    # the manifest, as the marketplace checks it
```

| Test | Covers |
| --- | --- |
| `model.test.js` | `Model.js`: normalizing, keys, budgets, presets, profiles, fills, clock, fullscreen fitting. |
| `stats.test.js` | `Stats.js`: frames and GPU lines into state, rates, histories. |
| `statsproc.test.js`, `statsnet.test.js`, `statssystem.test.js`, `statsgpu.test.js` | The parser of the same name. |
| `statsformat.test.js` | `StatsFormat.js`: palette, heat levels, text forms. |
| `statsviews.test.js` | `StatsViews.js`: tiling a strip. |
| `statspanels.test.js`, `statshardware.test.js` | `StatsViews.js`: each panel's rows. |
| `sampler.test.js` | Runs the real `stats.sh` on this machine and parses its frames ([spec](../specs/stats-frames.md)). |
| `cpupower.test.js` | `cpu-power.sh` against a made-up powercap tree (`CPU_POWER_SYSFS`); never needs root. |
| `qml.test.js` | Every plugin `Text` renders plain text, so metadata and names can't load images through markup. |

Put logic that can live without QML in `Model.js`, the `Stats*.js`
scripts or `StatsViews.js` and test
it there. A bug fix gets a regression test.

## Make a change

1. Read the [guide](../guide/) for the feature, then
   [architecture](../architecture.md) and the relevant
   [ADR](../adr/README.md) or [spec](../specs/).
2. Keep the change focused; update the guide, the spec it
   touches and `CHANGELOG.md` under **Unreleased**.
3. Run `npm test` and `omarchy plugin validate .`.
4. For a UI change, render it offscreen (below), deploy, and check it by
   hand on your own screens.
5. A durable design choice gets a new ADR.

## Render UI offscreen

UI is checked in a throwaway Quickshell config with Qt's offscreen
platform, never on the live screens: no `grim`, no `wtype`, no restart of
the running shell ([ADR 4](../adr/0004-offscreen-render-harness.md)). The
harness lives outside the repository, in a scratch folder:

```
harness/
  Commons -> /usr/share/omarchy/shell/Commons
  Ui/            symlinks to /usr/share/omarchy/shell/Ui/*, except KeyboardPanel.qml
  plugin/        a copy of the plugin's .qml, .js, qmldir, icon.svg and scripts
  bin/           fakes put first on PATH (nvidia-smi)
  home/          a throwaway HOME with a demo omareach.json and a theme
  powercap/      a fake RAPL tree, so CPU power reads "on"
  runtime/       a throwaway XDG_RUNTIME_DIR (mode 700)
  screens.json   the offscreen monitors
  shell.qml      draws one component and saves it with grabToImage
  run.sh
```

Set it up from the repository root:

```bash
H=$(mktemp -d)/harness
mkdir -p $H/plugin $H/Ui $H/bin $H/runtime $H/out $H/powercap/intel-rapl:0 \
  $H/home/.config/omarchy $H/home/.local/state/omarchy/current/theme
chmod 700 $H/runtime
cp *.qml *.js qmldir icon.svg cpu-power.sh stats.sh $H/plugin/
ln -s /usr/share/omarchy/shell/Commons $H/Commons
for f in /usr/share/omarchy/shell/Ui/*; do
  [ "${f##*/}" = KeyboardPanel.qml ] || ln -s "$f" "$H/Ui/${f##*/}"
done
rm $H/Ui/qmldir && cp /usr/share/omarchy/shell/Ui/qmldir $H/Ui/
cp /usr/share/omarchy/themes/tokyo-night/colors.toml $H/home/.local/state/omarchy/current/theme/
echo 123456789 > $H/powercap/intel-rapl:0/energy_uj
```

Any installed theme works; the README images use the palette in
[branding.md](../branding.md#colours). Then add the files below.

`KeyboardPanel` needs a Wayland layer surface, so `Ui/KeyboardPanel.qml`
is a `FloatingWindow` stand-in with the same API that saves the card
once the panel has opened:

```qml
import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons

// Offscreen stand-in for KeyboardPanel: a FloatingWindow holding the card,
// since the real one needs a Wayland layer surface.
FloatingWindow {
  id: root
  property Item anchorItem: null
  property QtObject bar: null
  property var owner: null
  property int margin: Style.gapsOut
  property int padding: Style.spacing.popupPadding
  property int contentWidth: Style.space(280)
  property int contentHeight: Style.space(200)
  property bool centerOnBar: false
  property bool open: false
  property int gap: Style.gapsOut
  property Item focusTarget: null
  property alias card: card
  default property alias contentItem: contentHolder.children
  function fittedContentWidth(width, cap) { return Math.round(Math.max(1, Number(width) || 1)) }
  function fittedContentHeight(implicitHeight, cap) { return Math.round((Number(implicitHeight) || 0) + padding * 2 + 2) }
  function cappedContentHeight(height) { return height }
  function close() {}
  visible: open
  implicitWidth: contentWidth
  implicitHeight: contentHeight
  color: "transparent"
  Rectangle {
    id: card
    width: root.contentWidth
    height: root.contentHeight
    color: Commons.Color.popups.background
    border.color: Commons.Color.popups.border
    border.width: 1
    radius: Style.cornerRadius
    Item { id: contentHolder; x: root.padding; y: root.padding; width: root.contentWidth - root.padding * 2; height: root.contentHeight - root.padding * 2 }
  }
  Timer {
    interval: 6000
    running: root.open && Quickshell.env("CAPTURE") === "panel"
    onTriggered: card.grabToImage(function(result) { result.saveToFile(Quickshell.env("OUT")); Qt.quit() })
  }
}
```

`shell.qml` draws the stats fill of a 660 px top edge on a 1080 px wide
monitor, or opens the panel, depending on `CAPTURE`. `PANELS` (a comma
list) picks the dashboard's panels and `PAGE` the panel's page:

```qml
import QtQuick
import Quickshell
import "plugin" as Reserve

// Offscreen capture harness: CAPTURE=stats draws the stats fill of a 660 px
// top edge on a 1080 px wide monitor; CAPTURE=panel opens the panel.
ShellRoot {
  FloatingWindow {
    visible: Quickshell.env("CAPTURE") === "stats"
    implicitWidth: 1080
    implicitHeight: 660
    color: "black"
    Reserve.ReserveFill {
      id: fill
      anchors.fill: parent
      side: "top"
      mode: "stats"
      dim: 0.6
      panels: (Quickshell.env("PANELS") || "gpu,cpu,memory,network").split(",")
      size: 660
      screenWidth: 1080
      screenHeight: 1920
    }
    Component.onCompleted: if (visible) Reserve.ReserveState.statsPreviews = 1
    Timer {
      interval: 9000
      running: Quickshell.env("CAPTURE") === "stats"
      onTriggered: fill.grabToImage(function(result) { result.saveToFile(Quickshell.env("OUT")); Qt.quit() })
    }
  }

  FloatingWindow {
    visible: Quickshell.env("CAPTURE") === "panel"
    implicitWidth: 60
    implicitHeight: 40
    color: "black"
    Loader {
      id: panelLoader
      active: Quickshell.env("CAPTURE") === "panel"
      source: "plugin/Panel.qml"
      onLoaded: openTimer.start()
    }
    Timer { id: openTimer; interval: 1500; onTriggered: { panelLoader.item.page = Quickshell.env("PAGE") || "edges"; panelLoader.item.open() } }
  }
}
```

`screens.json` names two offscreen monitors. With `QT_SCALE_FACTOR=2`
their logical size is half of this, so `DP-4` is a portrait 1080×1920
monitor in the panel:

```json
{ "screens": [
  { "name": "DP-4", "x": 0, "y": 0, "width": 2160, "height": 3840, "logicalDpi": 96, "logicalBaseDpi": 96, "dpr": 1 },
  { "name": "DP-5", "x": 2160, "y": 0, "width": 5120, "height": 2880, "logicalDpi": 96, "logicalBaseDpi": 96, "dpr": 1 }
] }
```

`home/.config/omarchy/omareach.json` is the demo state: 660 px on top of
`DP-4` with the stats fill, saved as the profile **Desk**:

```json
{
  "outputs": {
    "DP-4": {
      "enabled": true,
      "top": 660,
      "bottom": 0,
      "left": 0,
      "right": 0,
      "fill": "stats",
      "panels": [
        "gpu",
        "cpu",
        "memory",
        "network"
      ]
    },
    "DP-5": {
      "enabled": true,
      "top": 0,
      "bottom": 0,
      "left": 0,
      "right": 0
    }
  },
  "profiles": {
    "Desk": {
      "DP-4": {
        "enabled": true,
        "fill": "stats",
        "clockEdge": "largest",
        "dim": 60,
        "panels": [
          "gpu",
          "cpu",
          "memory",
          "network"
        ],
        "top": 660,
        "bottom": 0,
        "left": 0,
        "right": 0
      }
    }
  },
  "monitors": [
    "DP-4"
  ]
}
```

`run.sh` runs one capture with a clean environment, so the harness
reaches neither Hyprland (`HYPRLAND_INSTANCE_SIGNATURE` unset), nor the
running shell's IPC (its own `XDG_RUNTIME_DIR`), nor your settings (its
own `HOME`):

```bash
#!/usr/bin/env bash
# run.sh MODE OUT.png — one offscreen capture, isolated from the live session.
S=$(cd "$(dirname "$0")" && pwd)
env -i PATH="$S/bin:/usr/bin" HOME="$S/home" XDG_RUNTIME_DIR="$S/runtime" \
  XDG_STATE_HOME="$S/home/.local/state" XDG_CONFIG_HOME="$S/home/.config" \
  CPU_POWER_SYSFS="$S/powercap" CAPTURE="$1" OUT="$2" PANELS="$PANELS" HOT="$HOT" PAGE="$PAGE" \
  QT_QPA_PLATFORM="offscreen:configfile=$S/screens.json" QT_SCALE_FACTOR=2 \
  timeout 40 quickshell -p "$S" 2>&1 | grep -v "^  " | tail -25
```

```bash
$H/run.sh stats $H/out/stats.png               # 2160×1320: 1080×660 at 2x
PAGE=stats $H/run.sh panel $H/out/panel.png    # 860 wide, as tall as the page, at 2x
PANELS=gpu,cpu,memory,network,disks,processes,temps,system HOT=1 \
  $H/run.sh stats $H/out/hot.png               # eight panels, with warnings
```

Shaders (`MultiEffect`) draw nothing offscreen, and Hyprland, MPRIS and
UPower are absent, so fullscreen fitting, Now playing and peripherals'
batteries cannot be checked here.

### Fake numbers for the stats fill

The copied `stats.sh` reads this machine. For images that are going to be
published, replace `$H/plugin/stats.sh` with a fake that prints made-up
frames in the [frame format](../specs/stats-frames.md) twenty times a
second, so the graphs fill within seconds, and put a fake `nvidia-smi` in
`$H/bin`. The fakes used for the README images:

<details>
<summary><code>plugin/stats.sh</code> (fake)</summary>

```bash
#!/usr/bin/env bash
# Fake sampler for offscreen renders: made-up frames shaped like stats.sh's.
export LC_ALL=C
seed=42; n=0; user=0; sys=0; idle=0; rx=0; tx=0; rd=0; wr=0; energy=0
declare -a cu ci
for i in $(seq 0 23); do cu[$i]=0; ci[$i]=0; done
wave() { # wave N PERIOD LOW HIGH -> integer
  local x=$(( ($1 * 997 + $2 * 31) % 100 ))
  echo $(( $3 + ($4 - $3) * x / 100 ))
}
while :; do
  t=$(( 5000 + n ))
  printf '@time %s.00\n@stat\n' "$t"
  tb=0; ti=0
  for i in $(seq 0 23); do
    b=$(( 8 + (i * 37 + n * 13 + n * n % 17) % 40 )); (( i % 5 == 0 )) && b=$(( 50 + (n*7+i) % 45 ))
    cu[$i]=$(( cu[$i] + b )); ci[$i]=$(( ci[$i] + 100 - b )); tb=$(( tb + cu[$i] )); ti=$(( ti + ci[$i] ))
  done
  printf 'cpu  %d 0 0 %d 0 0 0 0 0 0\n' $tb $ti
  for i in $(seq 0 23); do printf 'cpu%d %d 0 0 %d 0 0 0 0 0 0\n' $i ${cu[$i]} ${ci[$i]}; done
  printf '@loadavg\n4.12 3.80 3.55 3/1450 22222\n'
  printf '@meminfo\nMemTotal:       63438000 kB\nMemFree:        8000000 kB\nMemAvailable:   %d kB\nBuffers:          400000 kB\nCached:         31800000 kB\nSwapTotal:      %d kB\nSwapFree:       %d kB\n' $(( 37700000 - (n % 7) * 20000 )) 126877000 126877000
  printf '@route\nIface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT\neth0\t00000000\t0100A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0\n'
  seed=$(( (seed * 1103515245 + 12345) % 2147483648 )); r=$(( seed / 65536 % 1000 ))
  burst=$(( r > 900 ? 2500000 + r * 1000 : (r > 700 ? 600000 + r * 600 : 80000 + r * 300) ))
  seed=$(( (seed * 1103515245 + 12345) % 2147483648 )); r=$(( seed / 65536 % 1000 ))
  rx=$(( rx + burst )); tx=$(( tx + 15000 + r * 40 + (r > 950 ? 400000 : 0) ))
  printf '@net\nInter-|   Receive\n face |bytes\n    lo: 1000 10 0 0 0 0 0 0 1000 10 0 0 0 0 0 0\n  eth0: %d 100 0 0 0 0 0 0 %d 100 0 0 0 0 0 0\n' $rx $tx
  rd=$(( rd + 2000 + n % 5 * 900 )); wr=$(( wr + 1500 + n % 4 * 700 ))
  printf '@disk\n 259 0 nvme0n1 1000 0 %d 100 1000 0 %d 100 0 0 0\n' $rd $wr
  printf '@model\nnvme0n1\tSample NVMe SSD 2TB\n'
  # HOT=1 runs the CPU near its limit and stalls I/O, to show warnings.
  io=0.40; [ -n "$HOT" ] && io=12.40
  printf '@psi\ncpu some avg10=1.20 avg60=1.00 avg300=0.90 total=1\nmemory some avg10=0.00 avg60=0.00 avg300=0.00 total=1\nio some avg10=%s avg60=0.30 avg300=0.20 total=1\n' $io
  tctl=$(( ${HOT:+34000} + 59000 + n%5*500 ))
  printf '@hwmon\nk10temp\ttemp1\tTctl\t%d\t\nk10temp\ttemp3\tTccd1\t%d\t\nk10temp\ttemp4\tTccd2\t%d\t\nspd5118\ttemp1\t\t51000\t85000\nnct6799\tfan1\tCPU fan\t%d\t\nnct6799\tfan2\tCase fan\t%d\t\n' $tctl 57000 55000 1180 860
  if (( n % 5 == 0 )); then printf '@slowhwmon\n@nvme\nnvme0\t41850\t84850\n'; fi
  energy=$(( energy + 82000000 + (n % 6) * 3000000 ))
  printf '@rapl\nintel-rapl:0\t%d\t65532610987\t\n' $energy
  printf '@freq\n'; for i in $(seq 0 23); do echo 5300000; done
  printf '@system\nhostname\tomarchy\nkernel\t6.17.0-arch1-1\nuptime\t%d.00 0\n' $t
  if (( n % 60 == 0 )); then
    printf '@sysinfo\nuser\tdemo\nshell\tbash\ndesktop\tHyprland\nos\tArch Linux\nomarchy\t4.0.4\nchannel\tstable\ntheme\tTsukiyo\nsys_vendor\tSample\nproduct_name\tDesktop\nboard_vendor\tSample\nboard_name\tX870\ncpu\tAMD Ryzen 9 7900X 12-Core Processor\npackages\t1312\n'
  fi
  printf '@power\n@drm\n'
  if (( ${2:-0} > 0 && n % ${2:-3} == 0 )); then
    printf '@procs\n1001 (firefox) S 1 0 0 0 0 0 0 0 0 0 %d 10 0 0 20 0 1 0 100 0 610000\n1003 (firefox) S 1 0 0 0 0 0 0 0 0 0 %d 10 0 0 20 0 1 0 100 0 240000\n1002 (Hyprland) S 1 0 0 0 0 0 0 0 0 0 %d 10 0 0 20 0 1 0 100 0 98000\n1004 (code) S 1 0 0 0 0 0 0 0 0 0 %d 10 0 0 20 0 1 0 100 0 352000\n' $(( n*30 )) $(( n*8 )) $(( n*12 )) $(( n*5 ))
    printf '@gpuapps\n1001, /usr/lib/firefox/firefox, 610\n4242, starwars.exe, 6340\n'
  fi
  printf '@end\n'
  n=$(( n + 1 ))
  read -t 0.05 <> <(:)
done
```

</details>

<details>
<summary><code>bin/nvidia-smi</code> (fake)</summary>

```bash
#!/usr/bin/env bash
# Fake nvidia-smi for offscreen renders.
line() {
  local n=$1 load=$(( 50 + (n * 37 + n * n * 7) % 35 ))
  (( n % 11 < 2 )) && load=$(( 20 + n % 9 ))
  printf '0, NVIDIA GeForce RTX 4080, %d, 6340, 16376, 59, %d.40, 320.00, 2790, 41, 0, 0\n' $load $(( 150 + load / 2 ))
}
case "$*" in
  *query-compute-apps*) echo "1001, firefox, 610"; exit 0 ;;
  *-lms*) n=0; while :; do line $n; n=$((n+1)); read -t 0.05 <> <(:); done ;;
  *query-gpu*) line 3 ;;
esac
```

</details>

Check every capture for real host names, serials, paths or addresses
before it goes into the repository.

## Refresh the preview

The README hero is `preview.png` at the repository root (3840×2160; the
marketplace shows it too). Its editable source is
[`docs/brand/preview.svg`](../brand/preview.svg), which places two
offscreen captures:

| Capture | From |
| --- | --- |
| `docs/brand/captures/stats.png` | `run.sh stats` with the fake sampler |
| `docs/brand/captures/panel.png` | `PAGE=stats run.sh panel` with the fake sampler |

The monitor frame, bar, terminal and placeholder window around the stats
capture are drawn in the SVG. To refresh:

1. Re-render the captures in the harness and copy them over
   `docs/brand/captures/`. Look at each one.
2. Edit `docs/brand/preview.svg` if the layout or text changes. Keep the
   inlined mark in sync with `icon.svg`.
3. Render and look at the result:

   ```bash
   rsvg-convert -o preview.png docs/brand/preview.svg
   ```

4. Keep the README's alt text accurate.

The SVG asks for JetBrainsMono Nerd Font (Omarchy's default font); the
chip icons are its glyphs. The current `preview.png` was rendered with
librsvg 2.63.3 with that font installed. Other fonts change spacing and
drop the icons, so inspect the output after rendering.

The guides' smaller images are renders of the same two components:
`docs/stats.png` as above, `docs/panel.png` the panel's Edges page, and
`docs/panel-pages.png` its four pages side by side:

```bash
for p in edges fill stats profiles; do PAGE=$p $H/run.sh panel $H/out/panel-$p.png; done
cd $H/out && magick panel-edges.png \( -size 24x1 xc:'#0a0e13' \) panel-fill.png \( -size 24x1 xc:'#0a0e13' \) panel-stats.png \
  \( -size 24x1 xc:'#0a0e13' \) panel-profiles.png -background '#0a0e13' -gravity north +append +repage panel-pages.png
```

Refresh them the same way when the panel or the dashboard changes.

## Release

1. Bump `version` in `manifest.json` and `package.json`.
2. Turn **Unreleased** in `CHANGELOG.md` into `## X.Y.Z — YYYY-MM-DD`.
3. Check the README and the guides cover the change.
4. `npm test` and `omarchy plugin validate .`.
5. Commit `Release X.Y.Z` and add an annotated tag:
   `git tag -a vX.Y.Z -m "OmaReach X.Y.Z"`.
6. Ask the owner before pushing the commit and the tag, and before
   publishing a GitHub release.
7. After pushing, file the marketplace's "Plugin verification" issue
   with the full 40-character commit SHA.
