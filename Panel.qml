import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs.Ui
import qs.Commons
import qs.Commons as Commons
import "." as Reserve
import "Model.js" as Model

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
  readonly property var profileNames: Model.profileNames(reserve.profiles)
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
  readonly property string align: pickedAlign || Model.inferAlign(edge, screenWidth, screenHeight)
  readonly property string aspect: edge.enabled ? Model.matchingAspect(edge, screenWidth, screenHeight, align) : ""

  // Keyboard cursor over the four edge rows.
  property int cursor: 0
  readonly property string cursorEdge: reserve.edgeNames[cursor]

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // --- popout placement ------------------------------------------------------
  //
  // KeyboardPanel assumes the bar touches the screen edge. A reservation on
  // the bar's side pushes the bar inwards, so `gap` grows by that amount and
  // the card opens beside the bar, not inside the black cap. Reservations
  // on the two edges beside the bar shift the bar along its length and can
  // hide the card's ends, which `popupAnchor` corrects.
  readonly property bool barHorizontal: barPosition === "top" || barPosition === "bottom"
  // Placement follows the bar's own monitor, not the one picked in the panel,
  // and the applied reservation, which is where the bar really is. It holds
  // still during a drag, so the card cannot slide under the pointer.
  readonly property var barEdge: fitted(reserve.appliedEdges(barOutput), barWindow ? barWindow.screen : null)
  readonly property int barSideReserve: barEdge[barPosition] || 0

  TransformWatcher {
    id: barWatcher
    a: root.barWindow ? root.barWindow.contentItem : null
    b: root
  }
  readonly property point barPos: {
    barWatcher.transform  // reactive dependency, as in KeyboardPanel
    return barWindow ? root.mapToItem(barWindow.contentItem, 0, 0) : Qt.point(0, 0)
  }

  // KeyboardPanel centers the card on its anchor in bar coordinates and only
  // keeps it `margin` from the screen edges. This invisible stand-in for the
  // button is offset so that the card lands centered on the button's real
  // screen position and clear of both side caps.
  Item {
    id: popupAnchor
    width: button.width
    height: button.height
    readonly property real offset: {
      var before = root.barHorizontal ? root.barEdge.left : root.barEdge.top
      var after = root.barHorizontal ? root.barEdge.right : root.barEdge.bottom
      var along = root.barHorizontal ? root.barPos.x : root.barPos.y
      var size = root.barHorizontal ? button.width : button.height
      var card = root.barHorizontal ? popup.contentWidth : popup.contentHeight
      var screen = root.barWindow && root.barWindow.screen
        ? (root.barHorizontal ? root.barWindow.screen.width : root.barWindow.screen.height) : 0
      if (!(screen > 0)) return 0
      var start = along + before + size / 2 - card / 2
      var wanted = Math.max(before + popup.margin, Math.min(start, screen - after - card - popup.margin))
      return wanted - (along + size / 2 - card / 2)
    }
    x: root.barHorizontal ? offset : 0
    y: root.barHorizontal ? 0 : offset
  }

  // The bar as KeyboardPanel sees it. KeyboardPanel matches clicks against
  // bar buttons as if the bar started at the screen's top-left corner (or
  // its bottom or right edge for such bars). A reservation on the bar's side
  // pushes the bar inwards, and one on its leading edge (left of a
  // horizontal bar, top of a vertical one) shifts it along; either way a
  // click would press the wrong button, or one from inside the cap. Hide
  // the buttons from it then: a click on the bar just closes the card.
  readonly property bool barShifted: barSideReserve > 0 || (barHorizontal ? barEdge.left : barEdge.top) > 0
  property QtObject popupBar: QtObject {
    readonly property string position: root.barPosition
    readonly property int barSize: root.bar ? root.bar.barSize : 0
    readonly property var activePopout: root.bar ? root.bar.activePopout : null
    readonly property var clickTargets: root.barShifted || !root.bar ? [] : root.bar.clickTargets
    function requestPopout(owner) { if (root.bar) root.bar.requestPopout(owner) }
    function releasePopout(owner) { if (root.bar) root.bar.releasePopout(owner) }
    function targetBelongsToWindow(target, window) { return root.bar ? root.bar.targetBelongsToWindow(target, window) : false }
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
    return screen ? Model.fit(entry, screen.width, screen.height) : entry
  }
  function limit(side) {
    return Model.limit(side, outputScreen ? outputScreen.width : 0, outputScreen ? outputScreen.height : 0, edge[Model.opposite(side)])
  }
  function setEdge(side, pixels) {
    var value = Model.clamp(Model.pixels(pixels), 0, limit(side))
    if (value !== edge[side]) undo = null
    reserve.setEdge(output, side, value)
  }
  function nudge(side, delta) { setEdge(side, Model.nudge(edge[side], delta, limit(side))) }
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
    if (Model.sameOutputs(before, reserve.outputs)) return
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
    if (Model.profileName(profileDraft) === name) profileDraft = ""
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
    if (!Model.sameOutputs(before, reserve.outputs))
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
    if (!Model.sameOutputs(before, reserve.outputs))
      undo = { outputs: before, text: "Restore each monitor's own stats panels" }
  }
  // Replaces every edge, so it can be undone like Clear.
  function applyAspect(ratio) {
    if (!outputScreen) return
    var saved = outputUndo()
    reserve.setAspect(output, screenWidth, screenHeight, Model.parseAspect(ratio), align)
    undo = Model.same(saved.entry, reserve.edges(output)) ? undo : saved
  }
  // Moves the reachable area along, and with it a preset that is in use.
  function cycleAlign() {
    var current = aspect
    pickedAlign = Model.nextAlign(align)
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
    // The edge keys work on any page, and bring up the edges they move.
    var edgeKeys = [Qt.Key_Up, Qt.Key_K, Qt.Key_Down, Qt.Key_J, Qt.Key_Left, Qt.Key_H, Qt.Key_Right, Qt.Key_L, Qt.Key_0, Qt.Key_Backspace, Qt.Key_Delete]
    if (edgeKeys.indexOf(key) !== -1) page = "edges"
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
    bar: root.popupBar
    open: root.opened
    focusTarget: keySurface
    // Wide enough for four fill and panel buttons a row, "Wallpaper" and
    // "Processes" included.
    contentWidth: fittedContentWidth(Style.space(430))
    contentHeight: fittedContentHeight(content.implicitHeight)
    gap: Style.gapsOut + root.barSideReserve

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

          PanelHero {
            width: parent.width
            title: "OmaReach"
            meta: (root.reserve.currentProfile ? root.reserve.currentProfile + "  ·  " : "") + Model.shortSummary(root.edge)
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconComponent: Component {
              Reserve.ReserveIcon {
                iconSize: Style.font.display * 1.25
                color: root.reserve.isActive(root.output) ? Commons.Color.accent : root.foreground
                reserved: root.reserved
                paused: root.reserved && !root.edge.enabled
              }
            }
            // The switch says what it does: it pauses the reservation.
            trailingControl: Component {
              Row {
                spacing: Style.spacing.sm
                opacity: root.reserved ? 1 : 0.4
                Text {
                  textFormat: Text.PlainText
                  anchors.verticalCenter: parent.verticalCenter
                  text: !root.reserved ? "Nothing reserved" : root.edge.enabled ? "On" : "Paused"
                  color: root.subtle
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
                ToggleSwitch {
                  anchors.verticalCenter: parent.verticalCenter
                  checked: root.reserve.isActive(root.output)
                  interactive: root.reserved
                  foreground: root.foreground
                  onToggled: { root.toggleEnabled(root.output); keySurface.forceActiveFocus() }
                }
              }
            }
          }

          // Equal-width monitor buttons. Every button carries an icon so they
          // share one height; as on the bar, a crossed-out monitor is paused.
          Row {
            id: monitorRow
            visible: root.screenNames.length > 1
            width: parent.width
            spacing: Style.spacing.md
            Repeater {
              model: root.screenNames
              Button {
                required property string modelData
                width: (monitorRow.width - monitorRow.spacing * (root.screenNames.length - 1)) / root.screenNames.length
                text: modelData
                iconText: root.reserve.isReserved(modelData) && !root.reserve.edges(modelData).enabled ? "󰶐" : "󰍹"
                tooltipText: modelData + "  ·  " + Model.summary(root.reserve.edges(modelData))
                selected: modelData === root.output
                bordered: true
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: { root.pickedOutput = modelData; keySurface.forceActiveFocus() }
              }
            }
          }

          Reserve.PanelPreview {
            panel: root
            width: parent.width
            height: Style.space(200)
          }

          // One page at a time below the preview, which stays in view on
          // every page so each edit shows where it lands.
          Row {
            id: pageRow
            width: parent.width
            spacing: Style.spacing.md
            Repeater {
              model: Model.PAGES
              Button {
                required property string modelData
                width: (pageRow.width - pageRow.spacing * (Model.PAGES.length - 1)) / Model.PAGES.length
                text: Model.PAGE_NAMES[modelData]
                horizontalPadding: Style.spacing.sm
                tooltipText: Model.PAGE_NAMES[modelData] + "  ·  [ and ] switch pages"
                selected: root.page === modelData
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: { root.page = modelData; keySurface.forceActiveFocus() }
              }
            }
          }

          Reserve.PanelEdgesPage {
            visible: root.page === "edges"
            panel: root
            width: parent.width
          }
          Reserve.PanelFillPage {
            visible: root.page === "fill"
            panel: root
            width: parent.width
          }
          Reserve.PanelStatsPage {
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

          // Shortcut sheet, toggled with ?.
          Grid {
            visible: root.showKeys
            width: parent.width
            columns: 2
            columnSpacing: Style.spacing.lg
            rowSpacing: Style.spacing.xs
            Repeater {
              model: [
                "[ / ]", "Previous / next page",
                "J / K", "Select edge",
                "H / L", "Shrink / grow 10 px  ·  ⇧ 100  ·  Ctrl 1",
                "0 / ⌫", "Zero edge",
                "U / Ctrl Z", "Undo a clear, zero, preset or profile change",
                "Space / P", "Pause monitor",
                "F", "Next fill",
                "C", "Clock or stats on the largest edge / top or bottom",
                "A", "Move the reachable area of an aspect preset",
                "R", "Ruler on the monitor",
                "I", "Black when idle: off, 30 s, 1 min, 5 min",
                "1 – 9", "Apply a profile",
                "S", "Name a profile to save",
                "Tab / ⇧ Tab", "Next / previous monitor",
                "Drag", "Move an edge in the preview  ·  Ctrl 1 px",
                "Scroll", "Move an edge 10 px  ·  ⇧ 100",
                "?", "Show or hide these shortcuts",
              "Esc / Q", "Close"
              ]
              Text {
                required property string modelData
                required property int index
                textFormat: Text.PlainText
                text: modelData
                color: index % 2 === 0 ? root.foreground : root.subtle
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: index % 2 === 0
              }
            }
          }

          Item {
            width: parent.width
            height: clearButton.implicitHeight
            Text {
              textFormat: Text.PlainText
              anchors.left: parent.left
              anchors.right: idleButton.left
              anchors.rightMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              text: root.showKeys ? "? hide shortcuts" : "? shortcuts"
              color: root.subtle
              elide: Text.ElideRight
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
            // Session-wide, unlike everything above it.
            Button {
              id: idleButton
              anchors.right: rulerButton.left
              anchors.rightMargin: Style.spacing.md
              text: "Idle  ·  " + Model.idleName(root.reserve.idleBlack)
              iconText: "󰒲"
              selected: root.reserve.idleBlack > 0
              bordered: true
              foreground: root.foreground
              fontFamily: root.fontFamily
              tooltipText: root.reserve.idleBlack > 0
                ? "Every edge on every monitor goes black after " + Model.idleName(root.reserve.idleBlack) + " without input"
                : "Black when idle: off. Click to black out every edge after a while without input"
              onClicked: { root.cycleIdle(); keySurface.forceActiveFocus() }
            }
            Button {
              id: rulerButton
              anchors.right: clearButton.left
              anchors.rightMargin: Style.spacing.md
              text: "Ruler"
              iconText: "󰑭"
              selected: root.reserve.ruler === root.output
              bordered: true
              foreground: root.foreground
              fontFamily: root.fontFamily
              tooltipText: "Show a ruler on " + root.output + " to read how much of each edge is hidden"
              onClicked: { root.toggleRuler(); keySurface.forceActiveFocus() }
            }
            Button {
              id: clearButton
              anchors.right: parent.right
              // Turns into Undo right after it (or a zeroed edge) discards values.
              text: root.canUndo ? "Undo" : "Clear"
              iconText: root.canUndo ? "󰕌" : "󰅖"
              enabled: root.canUndo || root.reserved
              opacity: enabled ? 1 : 0.4
              bordered: true
              foreground: root.foreground
              fontFamily: root.fontFamily
              tooltipText: root.canUndo ? root.undo.text : "Remove every reserved edge on " + root.output
              onClicked: {
                if (root.canUndo) root.undoLast()
                else root.clearOutput()
                keySurface.forceActiveFocus()
              }
            }
          }
        }
      }
    }
  }
}
