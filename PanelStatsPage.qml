import QtQuick
import qs.Ui
import qs.Commons
import "Model.js" as Model
import "StatsViews.js" as Views

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

  // --- keyboard cursor (Panel.pageKey) ----------------------------------------
  // In reading order: the shown panels two to a row, the toolbar's three
  // buttons, the panels to add three to a row, then Animation and CPU
  // power. Off the Stats fill, its one button, then the last row.
  readonly property int toolbarAt: active ? shown.length : 1
  readonly property int addAt: toolbarAt + (active && shown.length ? 3 : 0)
  readonly property int everyAt: addAt + (active ? hidden.length : 0)
  readonly property var cursorRows: (active
      ? Model.gridRows(shown.length, shownGrid.columns).concat(shown.length ? [3] : [], Model.gridRows(hidden.length, addGrid.columns))
      : [1])
    .concat([cpuPowerShown ? 2 : 1])
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
    if (active && index < toolbarAt) {
      if (alt) panel.togglePanelEverywhere(shown[index])
      else picked = shown[index]
    } else if (active && index < addAt) {
      if (index === toolbarAt) moveSelected(-1)
      else if (index === toolbarAt + 1) moveSelected(1)
      else hideSelected(alt)
    } else if (active && index < everyAt) {
      var name = hidden[index - addAt]
      if (alt) panel.togglePanelEverywhere(name)
      else panel.togglePanel(name)
    } else if (index === everyAt) paceDropdown.open()
    else if (index === everyAt + 1 && cpuPowerShown) changeCpuPower()
  }
  // Returns where the cursor goes: onto the panel that took the hidden
  // one's place, or the last one.
  function remove(index) {
    if (!active || index >= addAt) return index
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
          + "\nClick to select it for the buttons below  ·  Right click hides it on every monitor"
        onClicked: { page.picked = modelData; page.panel.refocus() }
        onRightClicked: { page.panel.togglePanelEverywhere(modelData); page.panel.refocus() }
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
  Item {
    id: everyRow
    width: parent.width
    height: cpuPowerButton.implicitHeight
    readonly property real cellWidth: page.cpuPowerShown ? (width - Style.spacing.md) / 2 : width
    // How smoothly every dashboard moves, against how often it redraws: a
    // list, since five choices are too many to cycle through blind.
    Dropdown {
      id: paceDropdown
      width: everyRow.cellWidth
      anchors.verticalCenter: parent.verticalCenter
      showLabel: false
      // As tall as the button beside it, which may be hidden.
      rowHeight: Math.round(cpuPowerButton.implicitHeight)
      value: String(page.panel.reserve.statsPace)
      options: Model.STATS_PACES.map(function(pace) { return { value: String(pace), label: "Animation  ·  " + Model.paceName(pace) } })
      hasCursor: page.cursorOn(page.everyAt)
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      onChanged: function(value) { page.panel.reserve.setStatsPace(Number(value)) }
      // The list takes the keys while open; they come back to the panel
      // when it closes, picked or not.
      onPopupOpenChanged: if (!popupOpen) page.panel.refocus()
    }
    // The CPU's power draw needs its energy counter, which is root's
    // until a udev rule opens it; hidden where there is none.
    Button {
      id: cpuPowerButton
      visible: page.cpuPowerShown
      width: everyRow.cellWidth
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: "CPU power  ·  " + (page.panel.reserve.cpuPower === "on" ? "On" : "Enable")
      iconText: "󱐋"
      selected: page.panel.reserve.cpuPower === "on"
      hasCursor: page.cursorOn(page.everyAt + 1)
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: page.panel.reserve.cpuPower === "on"
        ? "The CPU panel shows the CPU's power draw.\nClick to lock its energy counter to root again: a terminal shows the commands and asks first"
        : "The CPU's energy counter is root's, so the CPU panel cannot show its power draw.\nClick to open it with a udev rule: a terminal shows the commands and asks first"
      onClicked: { page.changeCpuPower(); page.panel.refocus() }
    }
  }
}
