import QtQuick
import Quickshell.Io
import qs.Ui
import qs.Commons
import "Model.js" as Model
import "StatsViews.js" as Views
import "Clock.js" as Clock

// The panel's Stats page: which panels this monitor's dashboard shows, in
// which order, and the settings every dashboard shares. Without the Stats
// fill there is nothing to arrange, so it offers to switch to it.
Column {
  id: page
  // The Panel this page edits: its monitor, edges and edit functions.
  required property var panel
  readonly property var shown: panel.edge.panels
  // What the dashboard will draw, as StatsFill decides it: panels with
  // nothing to show on this machine take no card, and those that do not
  // fit the strip are left off from the end.
  readonly property var samples: panel.reserve.stats.data
  readonly property var strip: Model.statsStrip(panel.edge, panel.screenWidth, panel.screenHeight)
  readonly property var dropped: strip ? Views.fit(Views.availablePanels(shown, samples), strip.width, strip.height).dropped : []
  readonly property var hidden: Model.panelOrder(shown).slice(shown.length).filter(function(p) { return Views.available(p, page.samples) })
  readonly property int possible: Model.STATS_PANELS.filter(function(p) { return Views.available(p, page.samples) }).length
  // Counted like `possible`: a panel this machine has no use for is chosen
  // but never drawn, and "10 of 9" read as a mistake.
  readonly property int shownHere: Views.availablePanels(shown, samples).length
  readonly property bool active: panel.edge.fill === "stats"
  readonly property bool cpuPowerShown: panel.reserve.cpuPower === "locked" || panel.reserve.cpuPower === "on"
  // Why a shown panel draws no card, or "".
  function missing(name) {
    if (!Views.available(name, samples)) return "not on this machine"
    return dropped.indexOf(name) !== -1 ? "doesn't fit" : ""
  }
  spacing: Style.spacing.sm

  // The shown panel the toolbar acts on: the one last clicked or reached
  // with the cursor, else the first.
  property string picked: ""
  readonly property string selected: shown.indexOf(picked) !== -1 ? picked : (shown[0] || "")
  readonly property int selectedIndex: shown.indexOf(selected)
  readonly property string selectedName: selected ? Model.panelName(selected) : ""
  readonly property string selectedMissing: selected ? missing(selected) : ""

  function moveSelected(delta) {
    if (!selected) return
    picked = selected
    panel.movePanel(selected, delta)
  }
  // Hides the selected panel and selects the one that takes its place, so
  // pressing x again goes on down the list.
  function hideSelected(everywhere) {
    if (!selected) return
    var index = selectedIndex
    var name = selected
    if (everywhere) panel.togglePanelEverywhere(name)
    else panel.togglePanel(name)
    picked = shown[Math.min(index, shown.length - 1)] || ""
  }

  // The Clock panel's settings, shared by every monitor, show while this
  // monitor's dashboard has it: the other zones and the sun.
  readonly property bool clockShown: active && shown.indexOf("clock") !== -1
  readonly property var zones: panel.reserve.statsZones
  readonly property bool canAddZone: zones.length < Clock.MAX_ZONES
  readonly property var location: panel.reserve.statsLocation
  // tzdata's zones with their coordinates, read while the section shows:
  // the list to add from, and where this machine's zone is for the sun.
  property var zoneTab: []
  readonly property var localPlace: {
    var zone = panel.reserve.stats.localZone
    for (var i = 0; i < zoneTab.length; i++) if (zoneTab[i].zone === zone) return zoneTab[i]
    return null
  }
  FileView {
    path: page.clockShown ? "/usr/share/zoneinfo/zone1970.tab" : ""
    printErrors: false
    onLoaded: page.zoneTab = Clock.parseZoneTab(text())
  }
  // Edits like any other, so the panel's undo goes.
  function removeZone(zone) {
    panel.undo = null
    panel.reserve.setStatsZones(zones.filter(function(z) { return z !== zone }))
  }
  function addZone(zone) {
    panel.undo = null
    panel.reserve.setStatsZones(zones.concat([zone]))
  }
  // Off, or on at this machine's zone's main city: near enough for the
  // sun, and nothing to type or look up. IPC takes exact coordinates.
  function toggleSun() {
    panel.undo = null
    if (location) panel.reserve.setStatsLocation(null)
    else if (localPlace) panel.reserve.setStatsLocation({ lat: localPlace.lat, lon: localPlace.lon })
  }

  // --- keyboard cursor (Panel.pageKey) ----------------------------------------
  // In reading order: the shown panels two to a row, the toolbar's three
  // buttons, the panels to add three to a row, then Animation's five
  // choices, CPU power and Mesh addresses, then with the Clock panel its zones and
  // Add zone, and Sun. Off the Stats fill, its one button, then the
  // every-monitor rows.
  readonly property int toolbarAt: active ? shown.length : 1
  readonly property int addAt: toolbarAt + (active && shown.length ? 3 : 0)
  readonly property int everyAt: addAt + (active ? hidden.length : 0)
  readonly property int meshAt: everyAt + Model.STATS_PACES.length + (cpuPowerShown ? 1 : 0)
  readonly property int zonesAt: meshAt + 1
  readonly property int sunAt: zonesAt + zones.length + (canAddZone ? 1 : 0)
  readonly property var cursorRows: (active
      ? Model.gridRows(shown.length, shownGrid.columns).concat(shown.length ? [3] : [], Model.gridRows(hidden.length, addGrid.columns))
      : [1])
    .concat([Model.STATS_PACES.length, cpuPowerShown ? 2 : 1], clockShown ? [zones.length + (canAddZone ? 1 : 0), 1] : [])
  readonly property var cursorKeys: (active
      ? shown.map(function(p) { return "shown:" + p }).concat(shown.length ? ["earlier", "later", "hide"] : [], hidden.map(function(p) { return "add:" + p }))
      : ["use"])
    .concat(Model.STATS_PACES.map(function(pace) { return "pace:" + pace }), cpuPowerShown ? ["cpu"] : [], ["mesh"],
      clockShown ? zones.map(function(z) { return "zone:" + z }).concat(canAddZone ? ["addzone"] : [], ["sun"]) : [])
  // A panel just added moves from Add to the shown ones; the cursor goes
  // with it.
  function cursorFallback(key) { return key.indexOf("add:") === 0 ? "shown:" + key.slice(4) : "" }
  readonly property int cursorHome: active && selectedIndex >= 0 ? selectedIndex : 0
  function cursorOn(index) { return panel.page === "stats" && panel.pageCursor === index }
  // Reaching a shown panel with the cursor selects it.
  Connections {
    target: page.panel
    function onPageCursorChanged() {
      var index = page.panel.pageCursor
      if (page.panel.page === "stats" && page.active && index >= 0 && index < page.shown.length) page.picked = page.shown[index]
    }
  }
  function activate(index, alt) {
    if (!active && index === 0) { panel.setFill("stats"); return }
    // Selecting is all a shown panel does, right-click too: hiding it on
    // every monitor from a slip was too easy. Hide's right-click does that.
    if (active && index < toolbarAt) picked = shown[index]
    else if (active && index < addAt) {
      if (index === toolbarAt) moveSelected(-1)
      else if (index === toolbarAt + 1) moveSelected(1)
      else hideSelected(alt)
    } else if (active && index < everyAt) {
      var name = hidden[index - addAt]
      if (alt) panel.togglePanelEverywhere(name)
      else panel.togglePanel(name)
    } else if (index >= everyAt && index < everyAt + Model.STATS_PACES.length) panel.reserve.setStatsPace(Model.STATS_PACES[index - everyAt])
    else if (index === meshAt - 1 && cpuPowerShown) changeCpuPower()
    else if (index === meshAt) toggleMeshAddress()
    else if (clockShown && index >= zonesAt && index < zonesAt + zones.length) removeZone(zones[index - zonesAt])
    else if (clockShown && canAddZone && index === sunAt - 1) zoneDropdown.open()
    else if (clockShown && index === sunAt) toggleSun()
  }
  // Returns where the cursor goes: onto the panel that took the hidden
  // one's place, or the last one.
  // What the last remove() did, for the panel's toast; "" for nothing.
  property string removed: ""
  function remove(index) {
    removed = ""
    if (clockShown && index >= zonesAt && index < zonesAt + zones.length) {
      removed = "Took " + Clock.zoneCity(zones[index - zonesAt]) + " off the clock"
      removeZone(zones[index - zonesAt])
      return index
    }
    if (!active || index >= addAt) return index
    removed = "Hid " + selectedName
    hideSelected(false)
    return index < toolbarAt ? Math.max(0, Math.min(index, shown.length - 1)) : index
  }
  // Shift and an arrow move the selected panel along the order; the cursor
  // goes with it.
  function shiftItem(index, delta) {
    if (!active || index >= toolbarAt) return -1
    picked = shown[index]
    moveSelected(delta)
    return shown.indexOf(picked)
  }
  function toggleMeshAddress() { panel.reserve.setStatsTunnelAddress(!panel.reserve.statsTunnelAddress) }
  function changeCpuPower() { panel.reserve.changeCpuPower(panel.reserve.cpuPower === "on" ? "disable" : "enable") }

  // --- not the stats fill ----------------------------------------------------
  Text {
    visible: !page.active
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "This monitor's edges don't show the stats dashboard. Switch its fill to Stats to pick and arrange the panels."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
  Button {
    visible: !page.active
    width: parent.width
    hasCursor: page.cursorOn(0)
    text: "Use the Stats fill"
    iconText: "󰨇"
    bordered: true
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
    onClicked: { page.panel.setFill("stats"); page.panel.refocus() }
  }

  // --- the panels shown, in order -------------------------------------------
  PanelSectionHeader {
    visible: page.active
    text: "SHOWN  ·  " + page.shownHere + " OF " + page.possible
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  // Two to a row, so ten panels take five rows rather than ten: one
  // toolbar below moves or hides the selected one.
  Flow {
    id: shownGrid
    visible: page.active && page.shown.length > 0
    width: parent.width
    readonly property int columns: 2
    spacing: Style.spacing.md
    Repeater {
      model: page.active ? page.shown : []
      Button {
        required property string modelData
        required property int index
        readonly property string missing: page.missing(modelData)
        readonly property int cells: Model.rowCells(page.shown.length, shownGrid.columns, index)
        width: Math.floor((shownGrid.width - shownGrid.spacing * (cells - 1)) / cells)
        leftAlign: true
        text: (index + 1) + "  " + Model.panelName(modelData)
        iconText: Views.ICONS[modelData]
        selected: modelData === page.selected
        hasCursor: page.cursorOn(index)
        // Dimmed while it draws no card: chosen, but not on the dashboard.
        opacity: missing ? 0.55 : 1
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        tooltipText: Model.panelName(modelData) + (missing ? "  ·  " + missing : "")
          + "\nClick to select it for the buttons below"
        onClicked: { page.picked = modelData; page.panel.refocus() }
        onRightClicked: { page.picked = modelData; page.panel.refocus() }
      }
    }
  }
  Row {
    id: toolbar
    visible: page.active && page.shown.length > 0
    width: parent.width
    spacing: Style.spacing.md
    readonly property real cellWidth: (width - spacing * 2) / 3
    Button {
      width: toolbar.cellWidth
      text: "Earlier"
      iconText: "󰁝"
      enabled: page.selectedIndex > 0
      opacity: enabled ? 1 : 0.4
      hasCursor: page.cursorOn(page.toolbarAt)
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: "Move " + page.selectedName.toLowerCase() + " earlier  ·  ⇧ K"
      onClicked: { page.moveSelected(-1); page.panel.refocus() }
    }
    Button {
      width: toolbar.cellWidth
      text: "Later"
      iconText: "󰁅"
      enabled: page.selectedIndex >= 0 && page.selectedIndex < page.shown.length - 1
      opacity: enabled ? 1 : 0.4
      hasCursor: page.cursorOn(page.toolbarAt + 1)
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: "Move " + page.selectedName.toLowerCase() + " later, where it is left off first  ·  ⇧ J"
      onClicked: { page.moveSelected(1); page.panel.refocus() }
    }
    Button {
      width: toolbar.cellWidth
      text: "Hide"
      iconText: "󰅖"
      hasCursor: page.cursorOn(page.toolbarAt + 2)
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: "Hide " + page.selectedName.toLowerCase() + " from the dashboard  ·  X\nRight click for every monitor"
      onClicked: { page.hideSelected(false); page.panel.refocus() }
      onRightClicked: { page.hideSelected(true); page.panel.refocus() }
    }
  }
  // What the selected panel is doing, or how the order works.
  Text {
    visible: page.active
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: page.shown.length === 0 ? "Nothing shown: add panels below."
      : page.selectedMissing ? page.selectedName + " " + page.selectedMissing + ", so it has no card. Panels that don't fit the edge are left off from the end."
      : "Panels that don't fit the edge are left off from the end."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }

  // --- the panels to add -----------------------------------------------------
  Item { visible: page.active && page.hidden.length > 0; width: 1; height: Style.spacing.sm }
  PanelSectionHeader {
    visible: page.active && page.hidden.length > 0
    text: "ADD"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  Flow {
    id: addGrid
    visible: page.active && page.hidden.length > 0
    width: parent.width
    readonly property int columns: 3
    spacing: Style.spacing.md
    Repeater {
      model: page.active ? page.hidden : []
      Button {
        required property string modelData
        required property int index
        readonly property int cells: Model.rowCells(page.hidden.length, addGrid.columns, index)
        width: Math.floor((addGrid.width - addGrid.spacing * (cells - 1)) / cells)
        text: Model.panelName(modelData)
        iconText: Views.ICONS[modelData]
        horizontalPadding: Style.spacing.sm
        hasCursor: page.cursorOn(page.addAt + index)
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        tooltipText: "Show " + Model.panelName(modelData).toLowerCase() + " last on the dashboard\nRight click for every monitor"
        onClicked: { page.panel.togglePanel(modelData); page.panel.refocus() }
        onRightClicked: { page.panel.togglePanelEverywhere(modelData); page.panel.refocus() }
      }
    }
  }

  // --- every dashboard -------------------------------------------------------
  Item { width: 1; height: Style.spacing.sm }
  PanelSectionHeader {
    text: "EVERY MONITOR"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  // How smoothly every dashboard moves, against how often it redraws: a
  // button each, since a list opened here ran past the panel's bottom.
  Item {
    id: paceRow
    width: parent.width
    height: cpuPowerButton.implicitHeight
    Text {
      id: paceLabel
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
      text: "Animation"
      color: page.panel.foreground
      font.family: page.panel.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    Row {
      id: paceButtons
      anchors.left: paceLabel.right
      anchors.leftMargin: Style.spacing.md
      anchors.right: parent.right
      spacing: Style.spacing.sm
      Repeater {
        model: Model.STATS_PACES
        Button {
          required property int modelData
          required property int index
          width: (paceButtons.width - paceButtons.spacing * (Model.STATS_PACES.length - 1)) / Model.STATS_PACES.length
          // As tall as the buttons with icons below.
          height: cpuPowerButton.implicitHeight
          text: Model.paceShort(modelData)
          horizontalPadding: Style.spacing.xs
          selected: page.panel.reserve.statsPace === modelData
          hasCursor: page.cursorOn(page.everyAt + index)
          bordered: true
          foreground: page.panel.foreground
          fontFamily: page.panel.fontFamily
          tooltipText: "Animation  ·  " + Model.paceName(modelData)
            + (modelData === 0 ? "\nGraphs and meters move at the monitor's refresh rate" : modelData === 1 ? "\nNumbers change once a second, with nothing moving in between" : "\nGraphs and meters move " + modelData + " times a second")
          onClicked: { page.panel.reserve.setStatsPace(modelData); page.panel.refocus() }
        }
      }
    }
  }
  Item {
    id: everyRow
    width: parent.width
    height: cpuPowerButton.implicitHeight
    readonly property real cellWidth: page.cpuPowerShown ? (width - Style.spacing.md) / 2 : width
    // The CPU's power draw needs its energy counter, which is root's
    // until a udev rule opens it; hidden where there is none.
    Button {
      id: cpuPowerButton
      visible: page.cpuPowerShown
      width: everyRow.cellWidth
      anchors.verticalCenter: parent.verticalCenter
      text: "CPU power  ·  " + (page.panel.reserve.cpuPower === "on" ? "On" : "Enable")
      iconText: "󱐋"
      selected: page.panel.reserve.cpuPower === "on"
      hasCursor: page.cursorOn(page.meshAt - 1)
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: page.panel.reserve.cpuPower === "on"
        ? "The CPU panel shows the CPU's power draw.\nClick to lock its energy counter to root again: a terminal shows the commands and asks first"
        : "The CPU's energy counter is root's, so the CPU panel cannot show its power draw.\nClick to open it with a udev rule: a terminal shows the commands and asks first"
      onClicked: { page.changeCpuPower(); page.panel.refocus() }
    }
    // A mesh's address (Tailscale's 100.x) on the Network card, for ssh
    // from another machine; off, the card says only that it is on, since
    // the dashboard is on screen for anyone in the room.
    Button {
      width: everyRow.cellWidth
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      // "Mesh addresses" at half width ran off the button; the tooltip
      // says it in full.
      text: "Mesh  ·  " + (page.panel.reserve.statsTunnelAddress ? "Shown" : "Hidden")
      iconText: "󰖂"
      selected: page.panel.reserve.statsTunnelAddress
      hasCursor: page.cursorOn(page.meshAt)
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: (page.panel.reserve.statsTunnelAddress
        ? "Mesh addresses: shown\nThe Network panel shows the address of each mesh, such as Tailscale.\nClick to show only that it is on"
        : "Mesh addresses: hidden\nThe Network panel shows only that a mesh, such as Tailscale, is on.\nClick to show its address too")
      onClicked: { page.toggleMeshAddress(); page.panel.refocus() }
    }
  }

  // --- the Clock panel ---------------------------------------------------------
  Item { visible: page.clockShown; width: 1; height: Style.spacing.sm }
  PanelSectionHeader {
    visible: page.clockShown
    text: "CLOCK  ·  EVERY MONITOR"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  // Up to three other zones, a button each (click to take it off), and
  // the list to add one from.
  Row {
    id: zoneRow
    visible: page.clockShown
    width: parent.width
    spacing: Style.spacing.md
    readonly property int cells: page.zones.length + (page.canAddZone ? 1 : 0)
    readonly property real cellWidth: (width - spacing * (cells - 1)) / Math.max(1, cells)
    Repeater {
      model: page.clockShown ? page.zones : []
      Button {
        required property string modelData
        required property int index
        width: zoneRow.cellWidth
        text: Clock.zoneCity(modelData)
        iconText: "󰥔"
        horizontalPadding: Style.spacing.sm
        hasCursor: page.cursorOn(page.zonesAt + index)
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        tooltipText: modelData + "\nClick to take it off the Clock panel  ·  X"
        onClicked: { page.removeZone(modelData); page.panel.refocus() }
      }
    }
    SearchableDropdown {
      id: zoneDropdown
      visible: page.canAddZone
      width: zoneRow.cellWidth
      showLabel: false
      rowHeight: Math.round(sunButton.implicitHeight)
      value: ""
      triggerLabel: "Add zone"
      placeholderText: "City or region..."
      options: page.zoneTab.filter(function(z) { return page.zones.indexOf(z.zone) === -1 })
        .map(function(z) { return { value: z.zone, label: z.city, description: z.zone } })
      hasCursor: page.cursorOn(page.sunAt - 1)
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      onChanged: function(value) { page.addZone(value) }
      onPopupOpenChanged: if (!popupOpen) page.panel.refocus()
    }
  }
  Button {
    id: sunButton
    visible: page.clockShown
    width: parent.width
    text: page.location ? "Sun  ·  " + page.location.lat + ", " + page.location.lon : "Sun  ·  Off"
    iconText: "󰖜"
    selected: page.location !== null
    enabled: page.location !== null || page.localPlace !== null
    opacity: enabled ? 1 : 0.4
    hasCursor: page.cursorOn(page.sunAt)
    bordered: true
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
    tooltipText: (page.location
      ? "The Clock panel shows sunrise and sunset here, worked out on this machine.\nClick to turn it off"
      : page.localPlace
        ? "Click to show sunrise and sunset on the Clock panel, for " + page.localPlace.city + ", the city of this machine's time zone. Nothing is looked up online"
        : "This machine's time zone has no city to work the sun out for")
      + "\nExact coordinates: omarchy-shell pym.omareach location <lat>,<lon>"
    onClicked: { page.toggleSun(); page.panel.refocus() }
  }
}
