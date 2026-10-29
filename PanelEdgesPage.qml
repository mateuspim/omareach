import QtQuick
import qs.Ui
import qs.Commons
import qs.Commons as Commons
import "Model.js" as Model
import "ModelEdges.js" as Edges

// The panel's Edges page: a slider and a pixel field for each edge, and
// the aspect presets with where they put the reachable area.
Column {
  id: page
  // The Panel this page edits: its monitor, edges and edit functions.
  required property var panel
  spacing: Style.spacing.sm

  PanelSectionHeader {
    text: page.panel.outputScale === 1 ? "EDGES  ·  PIXELS"
      : "EDGES  ·  LOGICAL PIXELS  ·  " + Number(page.panel.outputScale.toFixed(2)) + "× SCALE"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  Repeater {
    model: page.panel.reserve.edgeNames
    EdgeRow { width: parent.width }
  }
  // Presets that leave a reachable area of a given shape, and where
  // it goes.
  Row {
    id: aspectRow
    width: parent.width
    spacing: Style.spacing.md
    // The area button names its place ("Area · Bottom"), so it takes about
    // a third of the row and the presets share the rest.
    readonly property real alignWidth: Math.round(width * 0.32)
    readonly property real buttonWidth: (width - alignWidth - spacing * Edges.ASPECTS.length) / Edges.ASPECTS.length
    Repeater {
      model: Edges.ASPECTS
      Button {
        required property string modelData
        width: aspectRow.buttonWidth
        // As tall as the area button, whose icon makes it taller.
        height: areaButton.height
        text: modelData
        tooltipText: "Reserve edges so the reachable area is " + modelData
        selected: page.panel.aspect === modelData
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        onClicked: { page.panel.applyAspect(modelData); page.panel.refocus() }
      }
    }
    Button {
      id: areaButton
      width: aspectRow.alignWidth
      // "Bottom" alone read as "reserve the bottom".
      text: "Area · " + Edges.alignName(page.panel.align, page.panel.screenWidth, page.panel.screenHeight)
      iconText: page.panel.alignIcon(page.panel.align)
      tooltipText: "Where a preset puts the reachable area; the other edge of the pair gets the rest"
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      onClicked: { page.panel.cycleAlign(); page.panel.refocus() }
    }
  }

  // One edge: name, a slider for quick moves and a field for exact pixels.
  component EdgeRow: Item {
    id: row
    required property string modelData
    required property int index
    readonly property var panel: page.panel
    readonly property bool selected: panel.cursor === index
    readonly property int value: panel.edge[modelData]
    implicitHeight: Math.max(field.implicitHeight, slider.implicitHeight)

    Text {
      id: label
      textFormat: Text.PlainText
      width: Style.space(58)
      anchors.verticalCenter: parent.verticalCenter
      text: Model.title(row.modelData)
      color: row.selected ? Commons.Color.accent : (row.value > 0 ? row.panel.foreground : row.panel.subtle)
      font.family: row.panel.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    PanelSlider {
      id: slider
      bar: row.panel.bar
      anchors.left: label.right
      anchors.right: field.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      minimum: 0
      maximum: row.panel.limit(row.modelData)
      step: 10
      integer: true
      value: row.value
      fillColor: row.selected ? Commons.Color.accent : row.panel.foreground
      knobColor: fillColor
      onMoved: function(value) { row.panel.cursor = row.index; row.panel.setEdge(row.modelData, value) }
      onDraggingChanged: row.panel.reserve.hold(dragging)
      onReleased: row.panel.refocus()
    }
    NumberField {
      id: field
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      fieldWidth: Style.space(96)
      from: 0
      to: row.panel.limit(row.modelData)
      stepSize: 10
      value: row.value
      hasCursor: row.selected
      foreground: row.panel.foreground
      fontFamily: row.panel.fontFamily
      onModified: function(value) { row.panel.cursor = row.index; row.panel.setEdge(row.modelData, value) }
    }
    // The field being typed in is the selected edge, so the keys that end
    // the edit and the highlight refer to the same row.
    Connections {
      target: field.field
      function onActiveFocusChanged() { if (field.field.activeFocus) row.panel.cursor = row.index }
    }
  }
}
