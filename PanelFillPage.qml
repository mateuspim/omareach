import QtQuick
import qs.Ui
import qs.Commons
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
  spacing: Style.spacing.sm

  // What the reserved edges show. Black is the only safe choice on
  // OLED panels; the others hold a static image in place.
  PanelSectionHeader {
    text: "FILL"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  // A Flow, not a Grid: a Grid would widen every row to the
  // stretched last one.
  Flow {
    id: fillGrid
    width: parent.width
    property int columns: 4
    spacing: Style.spacing.md
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
        // A short last row stretches across: no empty cell.
        readonly property int cells: Model.rowCells(Model.FILLS.length, fillGrid.columns, index)
        width: Math.floor((fillGrid.width - fillGrid.spacing * (cells - 1)) / cells)
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
    visible: page.edge.fill === "dim"
    width: parent.width
    height: dimSlider.implicitHeight
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
        width: (clockRow.width - clockRow.spacing) / 2
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
    visible: page.edge.fill === "clock"
    width: parent.width
    spacing: Style.spacing.md
    Button {
      width: (clockOptions.width - clockOptions.spacing) / 2
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
      text: "Date"
      iconText: "󰃭"
      tooltipText: "The date under the time, where the edge is tall enough that the time keeps its size"
      selected: page.edge.clockDate
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      onClicked: { page.panel.toggleClockDate(); page.panel.refocus() }
    }
  }

  // Right-clicking a fill does the same, but nothing on screen says so.
  Item { visible: page.panel.screenNames.length > 1; width: 1; height: Style.spacing.sm }
  Button {
    visible: page.panel.screenNames.length > 1
    width: parent.width
    text: "Same on every monitor"
    iconText: "󰍺"
    bordered: true
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
    tooltipText: "Give every monitor this one's fill, with its dim amount, edge and stats panels"
    onClicked: { page.panel.setFillEverywhere(page.edge.fill); page.panel.refocus() }
  }
}
