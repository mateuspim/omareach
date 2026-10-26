pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "." as Reserve
import "Model.js" as Model

// Shared reservation state for the service (black caps) and every bar widget
// instance. Edits land here first so all surfaces update in the same frame;
// the JSON file is only persistence and a hook for hand edits.
//
// Callers name monitors by connector (DP-4). Entries are stored under the
// key from Model.outputKeys, which follows the monitor across connectors;
// entries saved under a connector name are still read and move to the new
// key on the next edit.
QtObject {
  id: root

  readonly property string path: Quickshell.env("HOME") + "/.config/omarchy/omareach.json"
  readonly property var edgeNames: Model.EDGES
  property var outputs: ({})
  // Seconds without input before every edge goes black; 0 never does. One
  // setting for the whole session, since idle is.
  property int idleBlack: 0
  // Frames a second the stats fill's graphs and meters move at
  // (Model.statsPace); one setting for every monitor, like idleBlack.
  property int statsPace: Model.STATS_PACE
  // Whether the network card shows a mesh's (Tailscale's) address, not
  // just that it is on. Off by default: the dashboard is on screen for
  // anyone in the room.
  property bool statsTunnelAddress: false
  // Named snapshots of `outputs` (Model.snapshot), saved beside it.
  property var profiles: ({})
  // Profiles applied by themselves when exactly a set of monitors is
  // connected, as { name: [storage keys] } (Model.autoProfiles).
  property var autoProfiles: ({})
  // The storage keys of the connected monitors, and the set last seen,
  // which is saved: a shell restart with the same monitors keeps the
  // edits made since, while a different set (docking, or booting docked
  // after a session without the dock) applies its automatic profile.
  readonly property var connected: Model.monitorSet(keys)
  property var lastMonitors: []
  property bool loaded: false
  onConnectedChanged: monitorTimer.restart()
  // The profile last applied or saved, which wins over other profiles
  // holding the same entries. Never saved.
  property string lastProfile: ""
  // The profile `outputs` matches right now, or "".
  readonly property string currentProfile: Model.currentProfile(profiles, outputs, lastProfile)
  // The monitor showing the calibration ruler, or "". Never saved.
  property string ruler: ""

  // What the service draws and Hyprland reserves. It trails `outputs`: every
  // change re-tiles each window on the monitor and moves the bar, so it is
  // applied at most every 100 ms, and not at all while a drag holds it. The
  // panel's preview follows `outputs` and stays live throughout.
  property var applied: ({})
  property bool holding: false
  onOutputsChanged: if (!holding && !applyTimer.running) apply()
  readonly property var keys: {
    var monitors = Hyprland.monitors.values
    var pairs = []
    for (var i = 0; i < monitors.length; i++)
      pairs.push({ name: monitors[i].name, description: monitors[i].description })
    return Model.outputKeys(pairs)
  }

  // Texts this instance wrote in the last few seconds, as { text, time }.
  // The watcher reports our own writes too, sometimes late and out of order;
  // a reload that matches one of them is an echo, not a hand edit, and must
  // not roll the state back. Older texts have long reached the disk, so a
  // file that matches one of them was restored by hand.
  property var written: []
  readonly property int echoWindow: 3000
  function recentWrites() {
    var since = Date.now() - echoWindow
    return written.filter(function(write) { return write.time >= since })
  }

  function keyFor(output) { return keys[output] || output }
  function entryIn(map, output) {
    var key = keyFor(output)
    return map[key] !== undefined ? map[key] : map[output]
  }
  function entry(output) { return entryIn(outputs, output) }

  // Stored values, including those of a paused output.
  function edges(output) { return Model.normalize(entry(output)) }
  // What the service draws and Hyprland reserves right now.
  function activeEdges(output) { return Model.active(entry(output)) }
  // What is on screen now; lags activeEdges while held or throttled.
  function appliedEdges(output) { return Model.active(entryIn(applied, output)) }
  function isReserved(output) { return Model.total(edges(output)) > 0 }
  function isActive(output) { return Model.total(activeEdges(output)) > 0 }

  function update(output, change) {
    if (!output) return
    var key = keyFor(output)
    var current = edges(output)
    var changed = Object.assign({}, current, change)
    // Drags snap to a grid and nudges clamp at the limits, so most calls
    // change nothing. Skip them unless an entry still has to move keys.
    var migrating = key !== output && outputs[output] !== undefined
    if (!migrating && Model.same(current, changed)) return
    var next = Object.assign({}, outputs)
    next[key] = changed
    if (key !== output) delete next[output]
    outputs = next
    saveTimer.restart()
  }

  function setEdge(output, name, pixels) {
    if (edgeNames.indexOf(name) === -1) return
    var change = {}
    change[name] = Model.pixels(pixels)
    update(output, change)
  }

  function setEnabled(output, enabled) { update(output, { enabled: enabled === true }) }

  function setFill(output, fill) {
    if (Model.FILLS.indexOf(fill) === -1) return
    update(output, { fill: fill })
  }

  function setIdleBlack(seconds) {
    var value = Model.idleSeconds(seconds)
    if (value === idleBlack) return
    idleBlack = value
    saveTimer.restart()
  }

  function setStatsPace(pace) {
    var value = Model.statsPace(pace)
    if (value === statsPace) return
    statsPace = value
    saveTimer.restart()
  }

  function setStatsTunnelAddress(on) {
    if (on === statsTunnelAddress) return
    statsTunnelAddress = on
    saveTimer.restart()
  }

  function toggleRuler(output) { ruler = ruler === output ? "" : output }

  // The edges that give `output` a reachable area of `aspect` (a number),
  // aligned by `align`; nothing when the monitor's size is unknown.
  function setAspect(output, width, height, aspect, align) {
    if (!(width > 0 && height > 0 && aspect > 0)) return
    update(output, Object.assign({ enabled: true }, Model.aspectEdges(width, height, aspect, align)))
  }

  function setDim(output, percent) { update(output, { dim: Model.dimPercent(percent) }) }

  // The stats panels `output` shows, as a list (Model.panelList).
  function setPanels(output, panels) { update(output, { panels: Model.panelList(panels) }) }
  // Switches one stats panel on `output` on or off; without `on`, flips it.
  function togglePanel(output, panel, on) { setPanels(output, Model.togglePanel(edges(output).panels, panel, on)) }
  // Moves one of `output`'s panels `delta` places along its order.
  function movePanel(output, panel, delta) { setPanels(output, Model.movePanel(edges(output).panels, panel, delta)) }

  function setClockEdge(output, clockEdge) {
    if (Model.CLOCK_EDGES.indexOf(clockEdge) === -1) return
    update(output, { clockEdge: clockEdge })
  }
  function setClockHours(output, hours) {
    if (Model.CLOCK_HOURS.indexOf(hours) === -1) return
    update(output, { clockHours: hours })
  }
  function setClockDate(output, on) { update(output, { clockDate: on === true }) }

  // Saves every monitor's entry as profile `name`, replacing one of that
  // name. Returns the name it saved under, or "" for a blank name.
  function saveProfile(name) {
    name = Model.findProfile(profiles, name) || Model.profileName(name)
    if (!name) return ""
    setProfile(name, outputs)
    lastProfile = name
    return name
  }

  // Stores `map` as profile `name` as it is, for saving or undoing a delete.
  function setProfile(name, map) {
    var next = Object.assign({}, profiles)
    next[name] = Model.snapshot(map)
    profiles = next
    saveTimer.restart()
  }

  // Makes the saved entries exactly what profile `name` holds. Returns the
  // profile's name, or "" when there is none by that name.
  function applyProfile(name) {
    name = Model.findProfile(profiles, name)
    if (!name) return ""
    lastProfile = name
    setOutputs(profiles[name])
    return name
  }

  function deleteProfile(name) {
    name = Model.findProfile(profiles, name)
    if (!name) return ""
    var next = Object.assign({}, profiles)
    delete next[name]
    profiles = next
    setAutoProfile(name, [])
    saveTimer.restart()
    return name
  }

  // Ties profile `name` to the monitor keys in `set`, replacing any
  // profile tied to the same set; an empty set unties it.
  function setAutoProfile(name, set) {
    var next = {}
    for (var other in autoProfiles)
      if (other !== name && !(set.length && Model.sameSet(autoProfiles[other], set))) next[other] = autoProfiles[other]
    if (set.length && profiles[name] !== undefined) next[name] = set.slice().sort()
    if (JSON.stringify(next) === JSON.stringify(autoProfiles)) return
    autoProfiles = next
    saveTimer.restart()
  }

  // Ties profile `name` to the monitors connected now, or unties it.
  // Returns the profile's name, or "" when there is none by that name.
  function setAuto(name, on) {
    name = Model.findProfile(profiles, name)
    if (!name) return ""
    setAutoProfile(name, on ? connected : [])
    return name
  }

  function isAuto(name) {
    return autoProfiles[name] !== undefined && Model.sameSet(autoProfiles[name], connected)
  }

  // Once the monitors settle after a change, a new set applies its
  // automatic profile.
  function checkMonitors() {
    if (!loaded || !connected.length || Model.sameSet(connected, lastMonitors)) return
    lastMonitors = connected
    saveTimer.restart()
    var name = Model.autoProfileFor(autoProfiles, connected)
    if (name) applyProfile(name)
  }

  // Replaces every saved entry at once, for a profile or undoing one.
  function setOutputs(map) {
    if (Model.sameOutputs(map, outputs)) return
    outputs = JSON.parse(JSON.stringify(map || {}))
    saveTimer.restart()
  }

  // Drops the edges but keeps the fill settings: they describe the monitor,
  // not one reservation.
  function clear(output) {
    var key = keyFor(output)
    if (outputs[key] === undefined && outputs[output] === undefined) return
    var current = edges(output)
    var next = Object.assign({}, outputs)
    delete next[key]
    delete next[output]
    var kept = { fill: current.fill, clockEdge: current.clockEdge, clockHours: current.clockHours, clockDate: current.clockDate, dim: current.dim, panels: current.panels }
    if (!Model.isDefault(kept)) next[key] = kept
    outputs = next
    saveTimer.restart()
  }

  function apply() {
    applied = outputs
    applyTimer.restart()
  }

  // Holds the screen at its current reservation while a drag runs; letting
  // go applies the final value at once.
  function hold(on) {
    if (holding === on) return
    holding = on
    if (!on) apply()
  }

  function save() {
    saveTimer.stop()
    var state = { outputs: outputs }
    if (idleBlack) state.idleBlack = idleBlack
    if (statsPace !== Model.STATS_PACE) state.statsPace = statsPace
    if (statsTunnelAddress) state.statsTunnelAddress = true
    if (Object.keys(profiles).length) state.profiles = profiles
    if (Object.keys(autoProfiles).length) state.autoProfiles = autoProfiles
    if (lastMonitors.length) state.monitors = lastMonitors
    var text = JSON.stringify(state, null, 2) + "\n"
    written = recentWrites().concat([{ text: text, time: Date.now() }])
    file.setText(text)
  }

  // Writes a pending edit now instead of after the debounce. The panel calls
  // this when it closes, so an edit is on disk before the shell can restart.
  function flush() { if (saveTimer.running) save() }

  function parse() {
    // A reload that races a pending save would roll the UI back a step.
    if (saveTimer.running) return
    var text = file.text()
    // A writer that truncates first leaves the file empty for a moment; the
    // full text follows with its own change event.
    if (text.trim() === "") return
    if (recentWrites().some(function(write) { return write.text === text })) return
    // Someone else wrote the file, so our older texts are no longer echoes;
    // restoring one of them by hand is an edit like any other.
    written = []
    try {
      var parsed = JSON.parse(text)
      outputs = parsed && parsed.outputs ? parsed.outputs : ({})
      idleBlack = Model.idleSeconds(parsed && parsed.idleBlack)
      statsPace = Model.statsPace(parsed && parsed.statsPace)
      statsTunnelAddress = (parsed && parsed.statsTunnelAddress) === true
      profiles = Model.profiles(parsed && parsed.profiles)
      autoProfiles = Model.autoProfiles(parsed && parsed.autoProfiles, profiles)
      lastMonitors = Model.keyList(parsed && parsed.monitors)
    } catch (error) {
      console.warn("omareach: invalid state file: " + error)
    }
  }

  property FileView file: FileView {
    path: root.path
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: { root.parse(); root.loaded = true; monitorTimer.restart() }
    // Atomic writes rename over the file, so it never goes missing during
    // our own saves; this only fires when the file is absent or deleted.
    onLoadFailed: if (!saveTimer.running) {
      root.written = []
      root.outputs = ({})
      root.idleBlack = 0
      root.statsPace = Model.STATS_PACE
      root.statsTunnelAddress = false
      root.profiles = ({})
      root.autoProfiles = ({})
      root.lastMonitors = []
      root.loaded = true
      monitorTimer.restart()
    }
  }

  // The image Omarchy's background layer shows, for the wallpaper fill.
  // Omarchy repoints this symlink on every wallpaper or theme change, and
  // inotify would only watch the image it points to, so it is polled, and
  // only while some monitor uses a wallpaper fill.
  readonly property string backgroundLink: Quickshell.env("HOME") + "/.local/state/omarchy/current/background"
  property string wallpaper: ""
  // Only connected monitors count: a saved one that is unplugged shows
  // nothing.
  readonly property bool usesWallpaper: {
    for (var output in keys) if (Model.showsWallpaper(edges(output).fill)) return true
    return false
  }
  onUsesWallpaperChanged: if (usesWallpaper && !wallpaperProc.running) wallpaperProc.running = true

  property Process wallpaperProc: Process {
    command: ["readlink", "-f", root.backgroundLink]
    stdout: StdioCollector {
      onStreamFinished: {
        var path = String(text || "").trim()
        if (path !== root.wallpaper) root.wallpaper = path
      }
    }
  }

  property Timer wallpaperTimer: Timer {
    interval: 2000
    repeat: true
    running: root.usesWallpaper
    onTriggered: if (!root.wallpaperProc.running) root.wallpaperProc.running = true
  }

  // The stats fill's numbers, from one sampler for every monitor. It runs
  // only while a connected monitor shows the dashboard, or a panel previews
  // it, and never while the session is idle: every edge is black then.
  // `idle` is the service's; `statsPreviews` counts open panels showing
  // the stats fill.
  property bool idle: false
  property int statsPreviews: 0
  readonly property var statsPanels: {
    if (statsPreviews > 0) return Model.STATS_PANELS
    var shown = []
    for (var output in keys) {
      var entry = activeEdges(output)
      if (entry.fill === "stats" && Model.total(entry) > 0) shown = shown.concat(entry.panels)
    }
    return Model.panelList(shown)
  }
  property Reserve.StatsSampler stats: Reserve.StatsSampler {
    running: root.statsPanels.length > 0 && !root.idle
    processes: root.statsPanels.indexOf("processes") !== -1
    gpu: ["gpu", "igpu", "processes", "temps"].some(function(panel) { return root.statsPanels.indexOf(panel) !== -1 })
    media: root.statsPanels.indexOf("media") !== -1
    batteries: root.statsPanels.indexOf("battery") !== -1
    pace: root.statsPace
    tunnelAddress: root.statsTunnelAddress
  }

  // The Omarchy logo's SVG source, for the logo fill to recolor.
  property FileView logoFile: FileView {
    path: (Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy") + "/logo.svg"
    printErrors: false
    onLoaded: root.logoSvg = text()
  }
  property string logoSvg: ""

  // Omarchy's square icon as block art, drawn over the wordmark on the
  // side edges.
  property FileView iconFile: FileView {
    path: (Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy") + "/icon.txt"
    printErrors: false
    onLoaded: root.iconArt = Model.blockBitmap(text())
  }
  property var iconArt: null

  // Whether the CPU's power draw can be read: "none" (no RAPL counter),
  // "locked" (root's, as the kernel leaves it) or "on"; "" until checked.
  // cpu-power.sh reads it, and opens or locks the counter in a floating
  // terminal that shows its root commands and asks first.
  property string cpuPower: ""
  readonly property string cpuPowerScript: decodeURIComponent(String(Qt.resolvedUrl("cpu-power.sh")).replace(/^file:\/\//, ""))
  property Process cpuPowerProc: Process {
    command: ["bash", root.cpuPowerScript, "status"]
    stdout: StdioCollector {
      onStreamFinished: {
        var status = String(text || "").trim()
        if (status !== root.cpuPower) root.cpuPower = status
      }
    }
  }
  function checkCpuPower() { if (!cpuPowerProc.running) cpuPowerProc.running = true }
  Component.onCompleted: checkCpuPower()
  function changeCpuPower(action) {
    if (action !== "enable" && action !== "disable") return
    Quickshell.execDetached(["omarchy-launch-floating-terminal-with-presentation",
      "bash '" + cpuPowerScript.replace(/'/g, "'\\''") + "' " + action])
  }

  property Timer applyTimer: Timer {
    interval: 100
    onTriggered: if (!root.holding && root.applied !== root.outputs) root.apply()
  }

  // Docking connects monitors one at a time; act on the set once it holds
  // still.
  property Timer monitorTimer: Timer {
    interval: 1500
    onTriggered: root.checkMonitors()
  }

  property Timer saveTimer: Timer {
    interval: 200
    onTriggered: root.save()
  }
}
