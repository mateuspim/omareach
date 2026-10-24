import QtQuick
import qs.Ui
import qs.Commons
import qs.Commons as Commons
import "Model.js" as Model

// The panel's Fill page: what the reserved edges show, how dark the
// dimmed wallpaper is, which edge the clock or the stats go on, and a way
// to give every monitor the same.
Column {
  id: page
  // The Panel this page edits: its monitor, edges and edit functions.
  required property var panel
  readonly property var edge: panel.edge
  readonly property bool single: Model.SINGLE_FILLS.indexOf(edge.fill) !== -1
  readonly property bool clock: edge.fill === "clock"
  readonly property bool dimmed: edge.fill === "dim"
  readonly property bool many: panel.screenNames.length > 1
  spacing: Style.spacing.sm

  // --- keyboard cursor (Panel.pageKey) ----------------------------------------
  // In reading order: the fills, the dim slider, the two edges a single
  // fill can go on, the clock's two options, and Same on every monitor.
  readonly property int dimAt: Model.FILLS.length
  readonly property int edgeAt: dimAt + (dimmed ? 1 : 0)
  readonly property int optionsAt: edgeAt + (single ? 2 : 0)
  readonly property int everyAt: optionsAt + (clock ? 2 : 0)
  readonly property var cursorRows: Model.gridRows(Model.FILLS.length, fillGrid.columns)
    .concat(dimmed ? [1] : [], single ? [2] : [], clock ? [2] : [], many ? [1] : [])
  readonly property int cursorHome: Model.FILLS.indexOf(edge.fill)
  function cursorOn(index) { return panel.page === "fill" && panel.pageCursor === index }
  function activate(index, alt) {
    if (index < dimAt) {
      if (alt) panel.setFillEverywhere(Model.FILLS[index])
      else panel.setFill(Model.FILLS[index])
    } else if (index >= edgeAt && index < optionsAt) panel.setClockEdge(Model.CLOCK_EDGES[index - edgeAt])
    else if (index === optionsAt && clock) panel.setClockHours(edge.clockHours === 12 ? 24 : 12)
    else if (index === optionsAt + 1 && clock) panel.toggleClockDate()
    else if (index === everyAt && many) panel.setFillEverywhere(edge.fill)
  }
  // Left and right move the dim slider while the cursor is on it.
  function adjust(index, dx) {
    if (!dimmed || index !== dimAt) return false
    panel.setDim(edge.dim + dx * 5)
    return true
  }

  // What the reserved edges show. Black is the only safe choice on
  // OLED panels; the others hold a static image in place.
  PanelSectionHeader {
    text: "FILL"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  // Every fill button the same width, a short last row centered: placed
  // by hand, since a Grid would widen every column to fit and a Flow
  // cannot center a row.
  Item {
    id: fillGrid
    width: parent.width
    height: childrenRect.height
    readonly property int columns: 4
    readonly property real spacing: Style.spacing.md
    readonly property real cellWidth: Math.floor((width - spacing * (columns - 1)) / columns)
    Repeater {
      model: [
        { fill: "black", icon: "󰝤", tip: "Plain black, safe on OLED panels" },
        { fill: "theme", icon: "󰏘", tip: "The theme's background color" },
        { fill: "logo", icon: "󰣇", tip: "The Omarchy logo on black: stacked with its icon on the sides" },
        { fill: "wallpaper", icon: "󰋩", tip: "The slice of the wallpaper under the edge" },
        { fill: "dim", icon: "󰃞", tip: "The wallpaper slice, darkened" },
        { fill: "clock", icon: "󰥔", tip: "A clock on one edge, 24- or 12-hour, with the date where it fits; the others stay black" },
        { fill: "stats", icon: "󰨇", tip: "A btop-style dashboard of GPU, CPU, memory and more on one edge; it stays up beside fullscreen games. Pick its panels on the Stats page" }
      ]
      Button {
        required property var modelData
        required property int index
        readonly property int cells: Model.rowCells(Model.FILLS.length, fillGrid.columns, index)
        readonly property real rowStart: (fillGrid.width - cells * fillGrid.cellWidth - (cells - 1) * fillGrid.spacing) / 2
        x: Math.round(rowStart + (index % fillGrid.columns) * (fillGrid.cellWidth + fillGrid.spacing))
        y: Math.floor(index / fillGrid.columns) * (implicitHeight + fillGrid.spacing)
        width: fillGrid.cellWidth
        hasCursor: page.cursorOn(index)
        text: Model.fillName(modelData.fill)
        iconText: modelData.icon
        // Four to a row: "Wallpaper" needs the room.
        horizontalPadding: Style.spacing.sm
        tooltipText: modelData.tip + "\nRight click for every monitor"
        selected: page.edge.fill === modelData.fill
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        onClicked: { page.panel.setFill(modelData.fill); page.panel.refocus() }
        onRightClicked: { page.panel.setFillEverywhere(modelData.fill); page.panel.refocus() }
      }
    }
  }
  // Only for the dimmed fill: how dark it is.
  Item {
    visible: page.dimmed
    width: parent.width
    height: dimSlider.implicitHeight
    // The keyboard cursor, in the buttons' hover color: left and right
    // move the slider.
    Rectangle {
      anchors.fill: parent
      anchors.margins: -Style.spacing.xs
      visible: page.cursorOn(page.dimAt)
      radius: Style.cornerRadius
      color: Style.hoverFillFor(page.panel.foreground, Commons.Color.accent)
    }
    Text {
      id: dimLabel
      textFormat: Text.PlainText
      width: Style.space(58)
      anchors.verticalCenter: parent.verticalCenter
      text: "Dim"
      color: page.panel.foreground
      font.family: page.panel.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    PanelSlider {
      id: dimSlider
      bar: page.panel.bar
      anchors.left: dimLabel.right
      anchors.right: dimValue.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      minimum: Model.DIM_MIN
      maximum: Model.DIM_MAX
      step: 5
      integer: true
      value: page.edge.dim
      fillColor: page.panel.foreground
      knobColor: fillColor
      onMoved: function(value) { page.panel.setDim(value) }
      onReleased: page.panel.refocus()
    }
    Text {
      id: dimValue
      textFormat: Text.PlainText
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(40)
      horizontalAlignment: Text.AlignRight
      text: page.edge.dim + "%"
      color: page.panel.subtle
      font.family: page.panel.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  // Only for the clock and the stats: which edge shows them.
  Item { visible: page.single; width: 1; height: Style.spacing.sm }
  PanelSectionHeader {
    visible: page.single
    text: Model.fillName(page.edge.fill).toUpperCase() + " SHOWN ON"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  Row {
    id: clockRow
    visible: page.single
    width: parent.width
    spacing: Style.spacing.md
    Repeater {
      model: [
        { clockEdge: "largest", icon: "󰩨", text: "Largest edge", tip: "The " + Model.fillName(page.edge.fill).toLowerCase() + " goes on the largest reserved edge" },
        { clockEdge: "topBottom", icon: "󰹹", text: "Top or bottom", tip: "The " + Model.fillName(page.edge.fill).toLowerCase() + " goes on the larger of the top and bottom edges, if either is reserved" }
      ]
      Button {
        required property var modelData
        required property int index
        width: (clockRow.width - clockRow.spacing) / 2
        hasCursor: page.cursorOn(page.edgeAt + index)
        text: modelData.text
        iconText: modelData.icon
        tooltipText: modelData.tip
        selected: page.edge.clockEdge === modelData.clockEdge
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        onClicked: { page.panel.setClockEdge(modelData.clockEdge); page.panel.refocus() }
      }
    }
  }

  // Only for the clock: how it reads.
  Row {
    id: clockOptions
    visible: page.clock
    width: parent.width
    spacing: Style.spacing.md
    Button {
      width: (clockOptions.width - clockOptions.spacing) / 2
      hasCursor: page.cursorOn(page.optionsAt)
      text: "12-hour"
      iconText: "󰥔"
      tooltipText: page.edge.clockHours === 12 ? "12-hour time, without AM or PM. Click for 24-hour" : "24-hour time. Click for 12-hour, without AM or PM"
      selected: page.edge.clockHours === 12
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      onClicked: { page.panel.setClockHours(page.edge.clockHours === 12 ? 24 : 12); page.panel.refocus() }
    }
    Button {
      width: (clockOptions.width - clockOptions.spacing) / 2
      hasCursor: page.cursorOn(page.optionsAt + 1)
      text: "Date"
      iconText: "󰃭"
      tooltipText: "The date under the time, or beside it on a short wide edge, where the time keeps most of its size"
      selected: page.edge.clockDate
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      onClicked: { page.panel.toggleClockDate(); page.panel.refocus() }
    }
  }

  // Right-clicking a fill does the same, but nothing on screen says so.
  Item { visible: page.many; width: 1; height: Style.spacing.sm }
  Button {
    visible: page.many
    width: parent.width
    hasCursor: page.cursorOn(page.everyAt)
    text: "Same on every monitor"
    iconText: "󰍺"
    bordered: true
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
    tooltipText: "Give every monitor this one's fill, with its dim amount, edge and stats panels"
    onClicked: { page.panel.setFillEverywhere(page.edge.fill); page.panel.refocus() }
  }
}
