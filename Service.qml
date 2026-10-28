import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import "." as Reserve
import "Model.js" as Model
import "Clock.js" as Clock

// Every reserved edge gets two layer surfaces:
//
//  - a Bottom-layer spacer whose exclusive zone does the actual reserving.
//    Hyprland arranges exclusive zones from the Background layer upwards, so
//    the spacer claims the edge before the Top-layer Omarchy bar does and the
//    bar lands just inside the reachable area instead of underneath the cap.
//    Tiled windows follow, with no monitors.lua rewrite or hyprctl reload.
//  - an Overlay-layer cap over exactly the same strip that swallows the
//    pointer and hides fullscreen or floating windows that stray into it.
//    It shows the monitor's fill (ReserveFill): black by default, and black
//    while the monitor shows a fullscreen window or the session is idle.
Scope {
  id: root
  readonly property var state: Reserve.ReserveState

  Variants {
    model: Quickshell.screens

    delegate: Scope {
      id: output
      required property var modelData
      // Fitted here as well as in the panel: hand edits and mode changes
      // never go through the panel's limits.
      readonly property var edge: Model.fit(Reserve.ReserveState.appliedEdges(modelData.name), modelData.width, modelData.height)
      // A fullscreen window (a video, a game) gets plain black beside it
      // rather than a bright logo or wallpaper; only the stats dashboard
      // stays, as a game is when it is most useful.
      readonly property bool fullscreen: Hyprland.monitorFor(modelData)?.activeWorkspace?.hasFullscreen ?? false
      function fillFor(side) {
        // Read in this order: the edge first wakes the state singleton,
        // which then reads as a binding loop at startup.
        var beside = fullscreen
        if (root.idle) return "black"
        var shown = Model.edgeFill(edge, side)
        return beside ? Model.fullscreenFill(shown) : shown
      }

      ReservedEdge { screen: output.modelData; side: "top"; pixels: output.edge.top; fill: output.fillFor("top"); dim: output.edge.dim; clockHours: output.edge.clockHours; clockDate: output.edge.clockDate; clockSeconds: output.edge.clockSeconds; panels: output.edge.panels }
      ReservedEdge { screen: output.modelData; side: "bottom"; pixels: output.edge.bottom; fill: output.fillFor("bottom"); dim: output.edge.dim; clockHours: output.edge.clockHours; clockDate: output.edge.clockDate; clockSeconds: output.edge.clockSeconds; panels: output.edge.panels }
      ReservedEdge { screen: output.modelData; side: "left"; pixels: output.edge.left; fill: output.fillFor("left"); dim: output.edge.dim; clockHours: output.edge.clockHours; clockDate: output.edge.clockDate; clockSeconds: output.edge.clockSeconds; panels: output.edge.panels }
      ReservedEdge { screen: output.modelData; side: "right"; pixels: output.edge.right; fill: output.fillFor("right"); dim: output.edge.dim; clockHours: output.edge.clockHours; clockDate: output.edge.clockDate; clockSeconds: output.edge.clockSeconds; panels: output.edge.panels }
    }
  }

  // Every edge goes black once the session has been idle for
  // ReserveState.idleBlack seconds, and back on the next input. An app that
  // inhibits idle, such as a video player, holds it off like it holds off
  // the screensaver.
  readonly property bool idle: idleMonitor.enabled && idleMonitor.isIdle
  // The stats sampler pauses with it.
  onIdleChanged: root.state.idle = idle
  IdleMonitor {
    id: idleMonitor
    enabled: root.state.idleBlack > 0
    timeout: Math.max(1, root.state.idleBlack)
    respectInhibitors: true
  }

  // The calibration ruler, over everything and click-through, on the
  // monitor ReserveState.ruler names.
  Variants {
    model: Quickshell.screens

    delegate: Scope {
      id: rulerOutput
      required property var modelData

      LazyLoader {
        active: root.state.ruler === rulerOutput.modelData.name

        PanelWindow {
          screen: rulerOutput.modelData
          anchors { top: true; bottom: true; left: true; right: true }
          exclusionMode: ExclusionMode.Ignore
          color: "transparent"
          mask: Region {}
          WlrLayershell.namespace: "pym-omareach-ruler"
          WlrLayershell.layer: WlrLayer.Overlay
          WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
          Reserve.Ruler { anchors.fill: parent }
        }
      }
    }
  }

  // Monitors named by an IPC argument: a connector name (DP-4), "" or
  // "focused" for the focused monitor, or "all".
  function outputsFor(output) {
    var names = []
    for (var i = 0; i < Quickshell.screens.length; i++) names.push(String(Quickshell.screens[i].name))
    output = String(output || "")
    if (output === "all") return names
    if (output === "" || output === "focused")
      return Hyprland.focusedMonitor ? [String(Hyprland.focusedMonitor.name)] : []
    return names.indexOf(output) !== -1 ? [output] : []
  }

  function anyActive() {
    for (var i = 0; i < Quickshell.screens.length; i++)
      if (root.state.isActive(Quickshell.screens[i].name)) return true
    return false
  }

  function screenFor(name) {
    for (var i = 0; i < Quickshell.screens.length; i++)
      if (Quickshell.screens[i].name === name) return Quickshell.screens[i]
    return null
  }

  // Runs `action` on each monitor `output` names and answers with one line
  // per monitor: what `action` returned (an error or a note), or the
  // monitor's summary.
  function each(output, action) {
    var names = outputsFor(output)
    if (!names.length) return output && output !== "focused" ? "No monitor named " + output : "No focused monitor"
    return names.map(function(name) {
      return name + "  ·  " + (action(name) || Model.summary(root.state.edges(name)))
    }).join("\n")
  }

  function noProfile(name) {
    var names = Model.profileNames(root.state.profiles)
    return "No profile named " + name + (names.length ? "; one of " + names.join(", ") : "; none saved yet")
  }

  // Sets the stats panels and says which are on, and when the stats fill
  // is not what the monitor shows.
  function setPanels(name, list) {
    root.state.setPanels(name, list)
    var entry = root.state.edges(name)
    var names = entry.panels.map(Model.panelName).join(", ") || "no panels"
    return "Stats: " + names + (entry.fill === "stats" ? "" : "  ·  shown with the stats fill")
  }

  function needsReserve(name) { return root.state.isReserved(name) ? "" : "No reserved edges" }

  // Sets a fill and says so even without reserved edges, where the summary
  // leaves it out.
  function setFill(name, fill) {
    root.state.setFill(name, fill)
    return root.state.isReserved(name) ? "" : Model.fillName(fill) + "  ·  no reserved edges to show it"
  }

  // omarchy-shell pym.omareach <function> [arguments];
  // docs/guide/keybinds-and-scripts.md lists them.
  IpcHandler {
    target: "pym.omareach"

    function status(): string {
      var result = {
        idleBlack: root.state.idleBlack, idle: root.idle, statsPace: root.state.statsPace, statsTunnelAddress: root.state.statsTunnelAddress,
        statsZones: root.state.statsZones, statsLocation: root.state.statsLocation, ruler: root.state.ruler,
        profile: root.state.currentProfile, profiles: Model.profileNames(root.state.profiles),
        autoProfiles: root.state.autoProfiles, monitors: root.state.connected, outputs: {}
      }
      root.outputsFor("all").forEach(function(name) { result.outputs[name] = root.state.edges(name) })
      return JSON.stringify(result)
    }
    function toggle(output: string): string {
      return root.each(output, function(name) { return root.needsReserve(name) || root.state.setEnabled(name, !root.state.edges(name).enabled) })
    }
    function pause(output: string): string {
      return root.each(output, function(name) { return root.needsReserve(name) || root.state.setEnabled(name, false) })
    }
    function resume(output: string): string {
      return root.each(output, function(name) { return root.needsReserve(name) || root.state.setEnabled(name, true) })
    }
    function fill(output: string, fill: string): string {
      var key = Model.fillFrom(fill)
      if (!key) return "Unknown fill " + fill + "; one of " + Model.FILLS.join(", ")
      return root.each(output, function(name) { return root.setFill(name, key) })
    }
    function dim(output: string, percent: int): string {
      return root.each(output, function(name) {
        root.state.setDim(name, percent)
        return "Dim " + root.state.edges(name).dim + "%"
      })
    }
    // The clock fill's hours, 12 or 24, and its date "on" or "off".
    function clockHours(output: string, hours: int): string {
      if (Model.CLOCK_HOURS.indexOf(hours) === -1) return "Say 12 or 24"
      return root.each(output, function(name) {
        root.state.setClockHours(name, hours)
        return "Clock  ·  " + hours + "-hour"
      })
    }
    function clockDate(output: string, state: string): string {
      if (state !== "on" && state !== "off") return "Say on or off"
      return root.each(output, function(name) {
        root.state.setClockDate(name, state === "on")
        return "Clock date  ·  " + state
      })
    }
    // What the clock fill does every second: "off", "blink" (the colon)
    // or "bar" (a bar under the time fills over the minute).
    function clockSeconds(output: string, mode: string): string {
      if (Model.CLOCK_SECONDS.indexOf(mode) === -1) return "Say " + Model.CLOCK_SECONDS.join(", ")
      return root.each(output, function(name) {
        root.state.setClockSeconds(name, mode)
        return "Clock seconds  ·  " + Model.CLOCK_SECONDS_NAMES[mode]
      })
    }
    // The Clock panel's other time zones, as a comma list of IANA names
    // (at most three), or "none".
    function zones(zones: string): string {
      var names = zones.trim() === "none" ? [] : zones.split(",").map(function(zone) { return zone.trim() })
      var list = Clock.zoneList(names)
      if (list.length !== names.filter(Boolean).length) return "Say up to " + Clock.MAX_ZONES + " zone names, such as Europe/Lisbon, or none"
      root.state.setStatsZones(list)
      return "Time zones  ·  " + (list.length ? list.join(", ") : "none")
    }
    // Where the Clock panel works out sunrise and sunset, as "lat,lon" in
    // degrees, or "none".
    function location(location: string): string {
      if (location.trim() === "none") { root.state.setStatsLocation(null); return "Sun  ·  off" }
      var parts = location.split(",")
      var place = parts.length === 2 ? Clock.location({ lat: parts[0].trim(), lon: parts[1].trim() }) : null
      if (!place) return "Say a latitude and longitude, such as 38.72,-9.14, or none"
      root.state.setStatsLocation(place)
      return "Sun  ·  " + place.lat + ", " + place.lon
    }
    // The stats panels, as a comma list of names, "all" or "none".
    function panels(output: string, panels: string): string {
      var list = Model.panelsFrom(panels)
      if (!list) return "Unknown panel in " + panels + "; one of " + Model.STATS_PANELS.join(", ")
      return root.each(output, function(name) { return root.setPanels(name, list) })
    }
    // One stats panel "on", "off" or, with neither, switched over.
    function panel(output: string, panel: string, state: string): string {
      var key = Model.panelFrom(panel)
      if (!key) return "Unknown panel " + panel + "; one of " + Model.STATS_PANELS.join(", ")
      if (state && state !== "on" && state !== "off") return "Say on or off"
      return root.each(output, function(name) {
        return root.setPanels(name, Model.togglePanel(root.state.edges(name).panels, key, state ? state === "on" : undefined))
      })
    }
    function nextFill(output: string): string {
      return root.each(output, function(name) { return root.setFill(name, Model.nextFill(root.state.edges(name).fill)) })
    }
    function edge(output: string, side: string, pixels: int): string {
      if (Model.EDGES.indexOf(side) === -1) return "Unknown edge " + side + "; one of " + Model.EDGES.join(", ")
      return root.each(output, function(name) {
        var screen = root.screenFor(name)
        var entry = root.state.edges(name)
        root.state.setEdge(name, side, Model.clamp(pixels, 0, Model.limit(side, screen.width, screen.height, entry[Model.opposite(side)])))
      })
    }
    function aspect(output: string, ratio: string, align: string): string {
      var value = Model.parseAspect(ratio)
      if (!value) return "Unknown aspect " + ratio + "; for example 16:9"
      if (align && !Model.alignment(align)) return "Unknown alignment " + align + "; top, left, center, bottom or right"
      return root.each(output, function(name) {
        var screen = root.screenFor(name)
        root.state.setAspect(name, screen.width, screen.height, value,
          Model.alignment(align) || Model.inferAlign(root.state.edges(name), screen.width, screen.height))
      })
    }
    function ruler(output: string): string {
      var names = root.outputsFor(output)
      if (names.length !== 1) return names.length ? "The ruler shows on one monitor at a time" : "No monitor named " + output
      root.state.toggleRuler(names[0])
      return root.state.ruler ? "Ruler on " + root.state.ruler : "Ruler off"
    }
    function profile(name: string): string {
      var applied = root.state.applyProfile(name)
      if (!applied) return root.noProfile(name)
      return "Profile " + applied + "\n" + root.each("all", function() {})
    }
    function saveProfile(name: string): string {
      var saved = root.state.saveProfile(name)
      return saved ? "Saved profile " + saved : "A profile needs a name"
    }
    function deleteProfile(name: string): string {
      var deleted = root.state.deleteProfile(name)
      return deleted ? "Deleted profile " + deleted : root.noProfile(name)
    }
    // "on" ties the profile to the monitors connected now, "off" unties it.
    function autoProfile(name: string, state: string): string {
      if (state !== "on" && state !== "off") return "Say on or off"
      var found = root.state.setAuto(name, state === "on")
      if (!found) return root.noProfile(name)
      return state === "on" ? found + " applies by itself with " + root.state.connected.join(", ") : found + " no longer applies by itself"
    }
    // One name per line, the one on screen marked.
    function profiles(): string {
      var names = Model.profileNames(root.state.profiles)
      if (!names.length) return "No profiles"
      return names.map(function(name) {
        var auto = root.state.autoProfiles[name]
        return (name === root.state.currentProfile ? "* " : "  ") + name + (auto ? "  ·  auto with " + auto.join(", ") : "")
      }).join("\n")
    }
    function idle(seconds: int): string {
      root.state.setIdleBlack(seconds)
      return "Black when idle: " + Model.idleName(root.state.idleBlack)
    }
    // Frames a second the dashboard's graphs and meters move at: 0 the
    // display's rate, 1 no animation.
    function pace(fps: int): string {
      root.state.setStatsPace(fps)
      return "Dashboard animation: " + Model.paceName(root.state.statsPace)
    }
    // status prints whether the CPU's power draw can be read (none, locked
    // or on); enable and disable open a terminal that shows the root
    // commands and asks first.
    function cpuPower(action: string): string {
      if (action === "enable" || action === "disable") {
        root.state.changeCpuPower(action)
        return "Opened a terminal to " + action + " the CPU's power draw"
      }
      if (action !== "status" && action !== "") return "Unknown action " + action + ": use status, enable or disable"
      // The last check's answer; the next one starts now.
      root.state.checkCpuPower()
      return root.state.cpuPower || "unknown"
    }
  }

  // Fullscreen on a monitor with a reserve fills the reachable area rather
  // than the whole monitor, where the cap would crop it (Model.fullscreenChanges).
  property var fitted: []

  Connections {
    target: Hyprland
    // Without a reserve anywhere there is nothing to fit; a check still
    // runs while some window is fitted, so `fitted` gets cleaned up.
    function onRawEvent(event) {
      if (event.name === "fullscreen" && (root.fitted.length || root.anyActive())) fullscreenCheck.request()
    }
  }

  Process {
    id: fullscreenCheck
    // An event while a check runs asks for another one when it finishes.
    property bool again: false
    function request() { if (running) again = true; else running = true }
    command: ["hyprctl", "-j", "clients"]
    onExited: if (again) { again = false; running = true }
    stdout: StdioCollector {
      onStreamFinished: {
        var clients = []
        try { clients = JSON.parse(text) } catch (e) { return }
        var reserved = Hyprland.monitors.values
          .filter(function(monitor) { return Reserve.ReserveState.isActive(monitor.name) })
          .map(function(monitor) { return monitor.id })
        var result = Model.fullscreenChanges(clients, reserved, root.fitted)
        root.fitted = result.fitted
        result.changes.forEach(function(change) {
          Hyprland.dispatch(Hyprland.usingLua
            ? 'hl.dsp.window.fullscreen_state({ window = "address:' + change.address + '", internal = ' + change.internal + ', client = ' + change.client + ' })'
            // The old dispatcher takes no window: it acts on the focused one,
            // which is almost always the one that just went fullscreen.
            : "fullscreenstate " + change.internal + " " + change.client)
        })
      }
    }
  }

  // An edge at 0 has no surfaces at all, rather than two hidden ones, so an
  // unreserved monitor costs nothing.
  component ReservedEdge: LazyLoader {
    id: reserved
    required property var screen
    required property string side
    required property int pixels
    required property string fill
    required property int dim
    required property int clockHours
    required property bool clockDate
    required property string clockSeconds
    required property var panels
    active: pixels > 0

    Scope {
      // The spacer only has to claim the edge: one transparent,
      // click-through pixel with an exclusive zone of the whole strip, since
      // the cap covers it anyway and a full-size buffer would be wasted.
      Strip {
        screen: reserved.screen
        side: reserved.side
        pixels: 1
        exclusionMode: ExclusionMode.Normal
        exclusiveZone: reserved.pixels
        color: "transparent"
        mask: Region {}
        WlrLayershell.namespace: "pym-omareach-spacer"
        WlrLayershell.layer: WlrLayer.Bottom
      }

      Strip {
        screen: reserved.screen
        side: reserved.side
        pixels: reserved.pixels
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "pym-omareach"
        WlrLayershell.layer: WlrLayer.Overlay
        MouseArea { anchors.fill: parent }
        Reserve.ReserveFill {
          anchors.fill: parent
          side: reserved.side
          mode: reserved.fill
          dim: reserved.dim / 100
          clockHours: reserved.clockHours
          clockDate: reserved.clockDate
          clockSeconds: reserved.clockSeconds
          panels: reserved.panels
          size: reserved.pixels
          screenWidth: reserved.screen.width
          screenHeight: reserved.screen.height
        }
      }
    }
  }

  // A black layer surface covering `pixels` along one edge of its screen,
  // anchored the same way for the spacer and the cap.
  component Strip: PanelWindow {
    id: strip
    required property string side
    required property int pixels
    readonly property bool horizontal: Model.isHorizontal(side)
    anchors { top: strip.side !== "bottom"; bottom: strip.side !== "top"; left: strip.side !== "right"; right: strip.side !== "left" }
    implicitHeight: horizontal ? pixels : 0
    implicitWidth: horizontal ? 0 : pixels
    color: "black"
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
  }
}
