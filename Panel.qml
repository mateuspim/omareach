import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs.Ui
import qs.Commons
import qs.Commons as Commons
import "." as Reserve
import "Model.js" as Model
import "ModelEdges.js" as Edges
import "ModelProfiles.js" as Profiles

// Bar button plus popout for editing reserved display edges. Edits go
// straight into ReserveState, so the caps, the bar and tiled windows move
// while you drag; there is nothing to apply.
Panel {
  id: root
  moduleName: "pym.omareach"
  manageIpc: false

  readonly property var reserve: Reserve.ReserveState
  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
  readonly property color subtle: Qt.darker(foreground, 1.45)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property var barWindow: button.QsWindow.window
  readonly property string barOutput: barWindow && barWindow.screen ? String(barWindow.screen.name) : ""
  readonly property string barPosition: bar && bar.position ? bar.position : "top"
  readonly property real barThickness: !barWindow ? 26
    : (barPosition === "left" || barPosition === "right" ? barWindow.width : barWindow.height)

  readonly property var screenNames: {
    var names = []
    for (var i = 0; i < Quickshell.screens.length; i++) {
      var name = String(Quickshell.screens[i].name || "")
      if (name) names.push(name)
    }
    return names
  }

  // The panel edits the monitor its bar sits on until another is picked.
  property string pickedOutput: ""
  readonly property string output: screenNames.indexOf(pickedOutput) !== -1
    ? pickedOutput
    : (barOutput || screenNames[0] || "")
  readonly property var outputScreen: {
    for (var i = 0; i < Quickshell.screens.length; i++)
      if (Quickshell.screens[i].name === output) return Quickshell.screens[i]
    return null
  }
  // Fitted to the monitor like the service draws them: hand edits and mode
  // changes never went through the panel's limits, and edits must start
  // from what is on screen.
  readonly property var edge: fitted(reserve.edges(output), outputScreen)
  readonly property var activeEdge: fitted(reserve.activeEdges(output), outputScreen)
  readonly property bool reserved: reserve.isReserved(output)
  // Reservations are in logical pixels; on a scaled monitor that is not
  // what a ruler on the panel measures, so the edges header says so.
  readonly property real outputScale: {
    var monitor = outputScreen ? Hyprland.monitorFor(outputScreen) : null
    return monitor && monitor.scale > 0 ? monitor.scale : 1
  }
  readonly property var barEntry: reserve.edges(barOutput)
  readonly property bool barReserved: Model.total(barEntry) > 0

  // One step back for the edits that throw values away: Clear, zeroing an
  // edge, an aspect preset, applying or deleting a profile. Any other edit,
  // or closing the panel, drops it. An undo for one monitor (`output` and
  // `entry`) only shows on that monitor; one for every monitor (`outputs`)
  // or a profile (`profile` and `entries`) shows on all. `text` says what
  // it restores.
  property var undo: null
  readonly property bool canUndo: undo !== null && (undo.output === undefined || undo.output === output)
  readonly property var profileNames: Profiles.profileNames(reserve.profiles)
  property bool showKeys: false
  // The page showing below the preview. It is kept while the shell runs,
  // so the panel opens where it was left.
  property string page: Model.PAGES[0]
  // The profile name being typed on the Profiles page, owned here so that
  // applying a profile or reopening the panel can set it.
  property string profileDraft: ""
  // While open on the stats fill, the preview needs live numbers, so the
  // sampler runs even if no monitor shows the dashboard yet.
  readonly property bool previewingStats: opened && edge.fill === "stats"
  onPreviewingStatsChanged: reserve.statsPreviews += previewingStats ? 1 : -1

  // Where an aspect preset puts the reachable area: picked in the panel, or
  // else read off the current edges.
  readonly property real screenWidth: outputScreen ? outputScreen.width : 0
  readonly property real screenHeight: outputScreen ? outputScreen.height : 0
  property string pickedAlign: ""
  readonly property string align: pickedAlign || Edges.inferAlign(edge, screenWidth, screenHeight)
  readonly property string aspect: edge.enabled ? Edges.matchingAspect(edge, screenWidth, screenHeight, align) : ""

  // Keyboard cursor over the four edge rows.
  property int cursor: 0
  readonly property string cursorEdge: reserve.edgeNames[cursor]
  // Keyboard cursor over the buttons of the Fill, Stats and Profiles pages,
  // in reading order; -1 until a key moves it, so a mouse user sees none.
  // Each page lists its rows' lengths in `cursorRows`, a name for each
  // button in `cursorKeys`, and says what Enter does in `activate(index, alt)`.
  property int pageCursor: -1
  onPageChanged: pageCursor = -1
  readonly property var pageView: page === "fill" ? fillPage
    : page === "stats" ? statsPage
    : page === "profiles" ? profilesPage
    : null

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  readonly property bool barHorizontal: barPosition === "top" || barPosition === "bottom"
  // Where the card opens, clear of the reservations around the bar.
  Reserve.PanelAnchor {
    id: popupAnchor
    panel: root
    barButton: button
    popupCard: popup
  }

  // Notices the CPU power terminal's change while the panel is open.
  Timer {
    interval: 2000
    repeat: true
    running: root.opened
    triggeredOnStart: true
    onTriggered: root.reserve.checkCpuPower()
  }

  onOpenedChanged: {
    // The ruler is for setting edges up here, so it goes with the panel.
    if (!opened) { reserve.hold(false); reserve.flush(); reserve.ruler = ""; return }
    pickedOutput = ""
    pickedAlign = ""
    undo = null
    showKeys = false
    pageCursor = -1
    // The profile on screen, ready to update or tie to these monitors; a
    // placeholder of its name looked typed but left Save and Auto off.
    profileDraft = reserve.currentProfile
  }
  // The ruler follows the monitor being edited.
  onOutputChanged: {
    pickedAlign = ""
    if (opened && reserve.ruler !== "") reserve.ruler = output
  }
  // A bar rebuild or hotplug can destroy the widget mid-drag, and nothing
  // else would release the hold.
  Component.onDestruction: {
    if (previewingStats) reserve.statsPreviews--
    if (opened) { reserve.hold(false); reserve.flush() }
  }

  function fitted(entry, screen) {
    return screen ? Edges.fit(entry, screen.width, screen.height) : entry
  }
  function limit(side) {
    return Edges.limit(side, outputScreen ? outputScreen.width : 0, outputScreen ? outputScreen.height : 0, edge[Model.opposite(side)])
  }
  function setEdge(side, pixels) {
    var value = Model.clamp(Model.pixels(pixels), 0, limit(side))
    if (value !== edge[side]) undo = null
    reserve.setEdge(output, side, value)
  }
  function nudge(side, delta) { setEdge(side, Edges.nudge(edge[side], delta, limit(side))) }
  function toggleEnabled(name) {
    if (!reserve.isReserved(name)) return
    undo = null
    reserve.setEnabled(name, !reserve.edges(name).enabled)
  }
  function zero(side) {
    if (!edge[side]) return
    var saved = outputUndo()
    setEdge(side, 0)
    undo = saved
  }
  function clearOutput() {
    if (!reserved) return
    var saved = outputUndo()
    reserve.clear(output)
    undo = saved
  }
  function outputUndo() {
    var entry = reserve.edges(output)
    return { output: output, entry: entry, text: "Restore " + Model.summary(entry) }
  }
  function undoLast() {
    if (!canUndo) return
    if (undo.outputs) reserve.setOutputs(undo.outputs)
    else if (undo.profile) {
      reserve.setProfile(undo.profile, undo.entries)
      if (undo.auto) reserve.setAutoProfile(undo.profile, undo.auto)
    }
    else reserve.update(undo.output, undo.entry)
    undo = null
  }
  // Every monitor changes at once, so the undo covers them all. The name
  // goes into the field, so tweaking the profile and pressing Update saves
  // over it.
  function applyProfile(name) {
    var before = reserve.outputs
    var from = reserve.currentProfile
    name = reserve.applyProfile(name)
    if (!name) return
    profileDraft = name
    if (Profiles.sameOutputs(before, reserve.outputs)) return
    undo = { outputs: before, text: "Restore every monitor as before " + name + (from ? ", " + from : "") }
  }
  function applyProfileAt(index) { if (index < profileNames.length) applyProfile(profileNames[index]) }
  function saveProfile(name) {
    if (reserve.saveProfile(name)) undo = null
    profileDraft = ""
  }
  function deleteProfile(name) {
    var entries = reserve.profiles[name]
    var auto = reserve.autoProfiles[name]
    if (!reserve.deleteProfile(name)) return
    if (Profiles.profileName(profileDraft) === name) profileDraft = ""
    undo = { profile: name, entries: entries, auto: auto, text: "Restore the profile " + name }
  }
  function setFill(fill) {
    if (fill === edge.fill) return
    undo = null
    reserve.setFill(output, fill)
  }
  // Gives every connected monitor `fill`, with this monitor's dim amount
  // and clock edge, so they all look alike; one undo puts them all back.
  function setFillEverywhere(fill) {
    var before = reserve.outputs
    var settings = { fill: fill, dim: edge.dim, clockEdge: edge.clockEdge, clockHours: edge.clockHours, clockDate: edge.clockDate, panels: edge.panels }
    screenNames.forEach(function(name) { reserve.update(name, settings) })
    if (!Profiles.sameOutputs(before, reserve.outputs))
      undo = { outputs: before, text: "Restore each monitor's own fill" }
  }
  function setDim(percent) {
    if (Model.dimPercent(percent) === edge.dim) return
    undo = null
    reserve.setDim(output, percent)
  }
  function setClockEdge(clockEdge) {
    if (Model.SINGLE_FILLS.indexOf(edge.fill) === -1 || clockEdge === edge.clockEdge) return
    undo = null
    reserve.setClockEdge(output, clockEdge)
  }
  function setClockHours(hours) {
    if (hours === edge.clockHours) return
    undo = null
    reserve.setClockHours(output, hours)
  }
  function toggleClockDate() {
    undo = null
    reserve.setClockDate(output, !edge.clockDate)
  }
  function togglePanel(panel) {
    undo = null
    reserve.togglePanel(output, panel)
  }
  function movePanel(panel, delta) {
    undo = null
    reserve.movePanel(output, panel, delta)
  }
  // Gives every connected monitor this monitor's choice for `panel`,
  // flipped; one undo puts them all back.
  function togglePanelEverywhere(panel) {
    var before = reserve.outputs
    var on = edge.panels.indexOf(panel) === -1
    screenNames.forEach(function(name) { reserve.togglePanel(name, panel, on) })
    if (!Profiles.sameOutputs(before, reserve.outputs))
      undo = { outputs: before, text: "Restore each monitor's own stats panels" }
  }
  // Replaces every edge, so it can be undone like Clear.
  function applyAspect(ratio) {
    if (!outputScreen) return
    var saved = outputUndo()
    reserve.setAspect(output, screenWidth, screenHeight, Edges.parseAspect(ratio), align)
    undo = Model.same(saved.entry, reserve.edges(output)) ? undo : saved
  }
  // Moves the reachable area along, and with it a preset that is in use.
  function cycleAlign() {
    var current = aspect
    pickedAlign = Edges.nextAlign(align)
    if (current) applyAspect(current)
  }
  function toggleRuler() { reserve.toggleRuler(output) }
  function cycleIdle() { reserve.setIdleBlack(Model.nextIdle(reserve.idleBlack)) }
  function alignIcon(align) {
    var vertical = screenHeight > screenWidth
    if (align === "start") return vertical ? "󰅃" : "󰅁"
    if (align === "end") return vertical ? "󰅀" : "󰅂"
    return vertical ? "󱇌" : "󱇉"
  }
  // Gives the keys back to the panel after a click or an edit in a field.
  function refocus() { keySurface.forceActiveFocus() }
  function focusProfileField() {
    page = "profiles"
    profilesPage.focusField()
  }
  function cycleOutput(direction) {
    if (screenNames.length < 2) return
    var index = screenNames.indexOf(output)
    pickedOutput = screenNames[(index + direction + screenNames.length) % screenNames.length]
  }

  function handleKey(event) {
    // A number field has focus and did not take this key. Typing stays in the
    // field; only the keys that end an edit act, and moving focus back to the
    // panel commits the typed value.
    if (!keySurface.activeFocus) {
      var ends = [Qt.Key_Escape, Qt.Key_Return, Qt.Key_Enter, Qt.Key_Tab, Qt.Key_Backtab]
      if (ends.indexOf(event.key) !== -1) { keySurface.forceActiveFocus(); event.accepted = true }
      return
    }
    if (event.text === "?") { showKeys = !showKeys; event.accepted = true; return }
    if (event.key === Qt.Key_Escape && showKeys) { showKeys = false; event.accepted = true; return }
    if (event.key === Qt.Key_Escape || event.text === "q") { root.close(); event.accepted = true; return }
    if (event.text === "[" || event.text === "]") { page = Model.nextPage(page, event.text === "]" ? 1 : -1); event.accepted = true; return }
    var shift = event.modifiers & Qt.ShiftModifier
    var step = shift ? 100 : (event.modifiers & Qt.ControlModifier ? 1 : 10)
    var key = event.key
    if (pageView && pageKey(event)) { event.accepted = true; return }
    // Zeroing an edge brings up the edges it changes.
    if (key === Qt.Key_0) page = "edges"
    if (key === Qt.Key_Up || key === Qt.Key_K) cursor = Math.max(0, cursor - 1)
    else if (key === Qt.Key_Down || key === Qt.Key_J) cursor = Math.min(reserve.edgeNames.length - 1, cursor + 1)
    else if (key === Qt.Key_Left || key === Qt.Key_H) nudge(cursorEdge, -step)
    else if (key === Qt.Key_Right || key === Qt.Key_L) nudge(cursorEdge, step)
    else if (key === Qt.Key_0 || key === Qt.Key_Backspace || key === Qt.Key_Delete) zero(cursorEdge)
    else if (key === Qt.Key_U || (key === Qt.Key_Z && event.modifiers & Qt.ControlModifier)) undoLast()
    else if (key === Qt.Key_Tab) cycleOutput(shift ? -1 : 1)
    else if (key === Qt.Key_Backtab) cycleOutput(-1)
    else if (key === Qt.Key_Space || key === Qt.Key_P) toggleEnabled(output)
    else if (key === Qt.Key_F) setFill(Model.nextFill(edge.fill))
    else if (key === Qt.Key_C) setClockEdge(edge.clockEdge === "largest" ? "topBottom" : "largest")
    else if (key === Qt.Key_A) cycleAlign()
    else if (key === Qt.Key_R) toggleRuler()
    else if (key === Qt.Key_I) cycleIdle()
    else if (key >= Qt.Key_1 && key <= Qt.Key_9) applyProfileAt(key - Qt.Key_1)
    else if (key === Qt.Key_S) focusProfileField()
    else return
    event.accepted = true
  }

  // The arrows and h j k l walk the page's buttons, Enter presses the one
  // under the cursor (Shift+Enter right-clicks it), x or Delete removes it
  // where that means something, and Shift with an arrow moves it where the
  // page orders things. The Edges page keeps these keys for the edges.
  function pageKey(event) {
    var key = event.key
    var shift = event.modifiers & Qt.ShiftModifier
    var dx = key === Qt.Key_Left || key === Qt.Key_H ? -1 : key === Qt.Key_Right || key === Qt.Key_L ? 1 : 0
    var dy = key === Qt.Key_Up || key === Qt.Key_K ? -1 : key === Qt.Key_Down || key === Qt.Key_J ? 1 : 0
    var view = pageView
    if (dx || dy) {
      if (pageCursor < 0) { pageCursor = Model.gridMove(view.cursorRows, view.cursorHome, 0, 0); return true }
      if (shift && view.shiftItem) { var moved = view.shiftItem(pageCursor, dx || dy); if (moved >= 0) pageCursor = moved; return true }
      if (dx && view.adjust && view.adjust(pageCursor, dx)) return true
      pageCursor = Model.gridMove(view.cursorRows, pageCursor, dx, dy)
      return true
    }
    if (key === Qt.Key_Return || key === Qt.Key_Enter) {
      if (pageCursor < 0) pageCursor = Model.gridMove(view.cursorRows, view.cursorHome, 0, 0)
      else {
        // What it pressed may add or take away buttons before it: the
        // cursor stays on the same button, not at the same place.
        var pressed = view.cursorKeys[pageCursor]
        view.activate(pageCursor, shift)
        pageCursor = Model.cursorAfter(view.cursorKeys, pressed, pageCursor, view.cursorFallback ? view.cursorFallback(pressed) : "")
      }
      return true
    }
    if (key === Qt.Key_X || key === Qt.Key_Delete || key === Qt.Key_Backspace) {
      if (pageCursor < 0 || !view.remove) return true
      // On Hide the cursor stays on Hide; on the panel or profile it took
      // away, the page says where it goes (the next one).
      var removing = view.cursorKeys[pageCursor]
      var next = view.remove(pageCursor)
      var kept = view.cursorKeys.indexOf(removing)
      pageCursor = kept !== -1 ? kept : Model.cursorAfter(view.cursorKeys, "", next)
      return true
    }
    return false
  }

  BarIconButton {
    id: button
    bar: root.bar
    // The plugin's icon, in the bar's colors: its edges show once the bar's
    // monitor has a reserve, struck through while that is paused.
    iconComponent: Component {
      Item {
        Reserve.ReserveIcon {
          anchors.centerIn: parent
          iconSize: Style.bar.iconCanvas
          color: button.active && button.useActiveColor ? button.activeColor : button.foreground
          reserved: root.barReserved
          paused: root.barReserved && !root.barEntry.enabled
        }
      }
    }
    active: root.opened || root.reserve.isActive(root.barOutput)
    tooltipText: root.barOutput + "  ·  " + Model.summary(root.barEntry)
      + (root.barReserved ? "\nRight click to " + (root.barEntry.enabled ? "pause" : "resume") : "")
    Accessible.role: Accessible.Button
    Accessible.name: "OmaReach"
    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton) root.toggle()
      else if (mouseButton === Qt.RightButton) root.toggleEnabled(root.barOutput)
    }
  }

  KeyboardPanel {
    id: popup
    anchorItem: popupAnchor
    owner: root
    bar: popupAnchor.popupBar
    open: root.opened
    focusTarget: keySurface
    // Wide enough for four fill and panel buttons a row, "Wallpaper" and
    // "Processes" included.
    contentWidth: fittedContentWidth(Style.space(430))
    contentHeight: fittedContentHeight(content.implicitHeight)
    gap: Style.gapsOut + popupAnchor.barSideReserve

    Item {
      id: keySurface
      anchors.fill: parent
      focus: root.opened
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) { root.handleKey(event) }

      // On a short screen KeyboardPanel caps the card's height; the page
      // then scrolls rather than losing its bottom rows.
      Flickable {
        id: scroller
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        interactive: contentHeight > height
        flickableDirection: Flickable.VerticalFlick
        boundsBehavior: Flickable.StopAtBounds
        clip: interactive

        Column {
          id: content
          width: popup.contentWidth - popup.padding * 2
          spacing: Style.spacing.lg

          Reserve.PanelHeader {
            panel: root
            width: parent.width
          }

          Reserve.PanelEdgesPage {
            visible: root.page === "edges"
            panel: root
            width: parent.width
          }
          Reserve.PanelFillPage {
            id: fillPage
            visible: root.page === "fill"
            panel: root
            width: parent.width
          }
          Reserve.PanelStatsPage {
            id: statsPage
            visible: root.page === "stats"
            panel: root
            width: parent.width
          }
          Reserve.PanelProfilesPage {
            id: profilesPage
            visible: root.page === "profiles"
            panel: root
            width: parent.width
          }

          Reserve.PanelKeys {
            panel: root
            width: parent.width
          }

          Reserve.PanelFooter {
            panel: root
            width: parent.width
          }
        }
      }
    }
  }
}
