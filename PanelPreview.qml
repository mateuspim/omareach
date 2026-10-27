import QtQuick
import qs.Commons
import qs.Commons as Commons
import "." as Reserve
import "Model.js" as Model
import "ModelEdges.js" as Edges

// The selected monitor to scale: black reserved edges, the reachable area,
// where the bar will sit, and a draggable handle on every edge.
Item {
  id: preview
  // The Panel this previews: its monitor, edges and edit functions.
  required property var panel
  readonly property real screenWidth: panel.outputScreen ? panel.outputScreen.width : 16
  readonly property real screenHeight: panel.outputScreen ? panel.outputScreen.height : 9
  readonly property real ratio: Math.min(width / screenWidth, (height - caption.height - Style.spacing.sm) / screenHeight)
  readonly property bool paused: !panel.edge.enabled
  readonly property real reachWidth: screenWidth - panel.edge.left - panel.edge.right
  readonly property real reachHeight: screenHeight - panel.edge.top - panel.edge.bottom
  readonly property Item monitorItem: monitor

  Rectangle {
    id: monitor
    anchors.horizontalCenter: parent.horizontalCenter
    width: Math.round(preview.screenWidth * preview.ratio)
    height: Math.round(preview.screenHeight * preview.ratio)
    color: Style.hoverFillFor(panel.foreground, Commons.Color.accent)
    border.color: panel.subtle
    border.width: 1
    clip: true

    // Bar strip where Hyprland puts it: inside the reachable area, or at
    // the screen edge while the monitor is paused.
    Rectangle {
      readonly property real thickness: Math.max(3, Math.round(panel.barThickness * preview.ratio))
      readonly property bool horizontal: panel.barHorizontal
      x: panel.barPosition === "right" ? monitor.width - panel.activeEdge.right * preview.ratio - thickness : panel.activeEdge.left * preview.ratio
      y: panel.barPosition === "bottom" ? monitor.height - panel.activeEdge.bottom * preview.ratio - thickness : panel.activeEdge.top * preview.ratio
      width: horizontal ? monitor.width - (panel.activeEdge.left + panel.activeEdge.right) * preview.ratio : thickness
      height: horizontal ? thickness : monitor.height - (panel.activeEdge.top + panel.activeEdge.bottom) * preview.ratio
      color: panel.foreground
      opacity: 0.55
    }

    Repeater {
      model: panel.reserve.edgeNames
      Reserve.ReserveFill {
        required property string modelData
        side: modelData
        mode: Model.edgeFill(panel.edge, modelData)
        dim: panel.edge.dim / 100
        clockHours: panel.edge.clockHours
        clockDate: panel.edge.clockDate
        panels: panel.edge.panels
        pixelRatio: preview.ratio
        size: panel.edge[modelData] * preview.ratio
        screenWidth: monitor.width
        screenHeight: monitor.height
        logoColor: panel.foreground
        visible: size > 0
        x: modelData === "right" ? monitor.width - size : 0
        y: modelData === "bottom" ? monitor.height - size : 0
        width: horizontal ? monitor.width : size
        height: horizontal ? size : monitor.height
        opacity: preview.paused ? 0.45 : 1
        // Only over plain black: it would sit on top of the logo, and the
        // fields below show the same number.
        Text {
          textFormat: Text.PlainText
          anchors.centerIn: parent
          visible: parent.mode === "black" && (parent.horizontal ? parent.height >= font.pixelSize + 4 : parent.width >= implicitWidth + 6)
          text: panel.edge[parent.modelData]
          color: panel.subtle
          font.family: panel.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }

  // An edge drags from anywhere in its black strip, or from the thin
  // handle on its boundary, which sits outside the clipped monitor so an
  // edge at 0 stays grabbable. Handles come second, so a boundary wins
  // where it crosses another edge's strip.
  Repeater {
    model: panel.reserve.edgeNames
    EdgeDrag {
      view: preview
      readonly property real size: panel.edge[modelData] * preview.ratio
      visible: size > 0
      x: monitor.x + (modelData === "right" ? monitor.width - size : 0)
      y: monitor.y + (modelData === "bottom" ? monitor.height - size : 0)
      width: horizontal ? monitor.width : size
      height: horizontal ? size : monitor.height
    }
  }
  Repeater {
    model: panel.reserve.edgeNames
    EdgeDrag {
      id: handle
      view: preview
      readonly property real boundary: {
        var size = panel.edge[modelData] * preview.ratio
        if (modelData === "top") return monitor.y + size
        if (modelData === "bottom") return monitor.y + monitor.height - size
        if (modelData === "left") return monitor.x + size
        return monitor.x + monitor.width - size
      }
      readonly property int grab: Style.space(10)
      x: horizontal ? monitor.x : boundary - grab / 2
      y: horizontal ? boundary - grab / 2 : monitor.y
      width: horizontal ? monitor.width : grab
      height: horizontal ? grab : monitor.height

      Rectangle {
        anchors.centerIn: parent
        width: handle.horizontal ? parent.width : Math.max(2, Style.space(2))
        height: handle.horizontal ? Math.max(2, Style.space(2)) : parent.height
        color: Commons.Color.accent
        visible: handle.lit
      }
    }
  }

  Text {
    id: caption
    textFormat: Text.PlainText
    anchors.bottom: parent.bottom
    anchors.horizontalCenter: parent.horizontalCenter
    text: preview.paused
      ? "Paused  ·  reservation kept, not applied"
      : Math.round(preview.screenWidth) + " × " + Math.round(preview.screenHeight)
        + "  →  " + Math.max(0, Math.round(preview.reachWidth)) + " × " + Math.max(0, Math.round(preview.reachHeight)) + " reachable"
    color: panel.subtle
    font.family: panel.fontFamily
    font.pixelSize: Style.font.caption
  }

  // Drags and scrolls one edge of a MonitorPreview. Drags are relative to the
  // press, so grabbing anywhere neither moves nor snaps the edge until the
  // pointer does, and the screen holds still until release.
  component EdgeDrag: MouseArea {
    id: drag
    required property string modelData
    required property int index
    required property Item view
    readonly property Item monitor: view.monitorItem
    readonly property bool horizontal: Model.isHorizontal(modelData)
    readonly property bool lit: pressed || containsMouse || view.panel.cursor === index
    hoverEnabled: true
    preventStealing: true
    cursorShape: horizontal ? Qt.SizeVerCursor : Qt.SizeHorCursor

    property int startValue: 0
    property point startPoint: Qt.point(0, 0)
    property real wheelRest: 0

    onPressed: function(mouse) {
      view.panel.reserve.hold(true)
      view.panel.cursor = index
      startValue = view.panel.edge[modelData]
      startPoint = mapToItem(monitor, mouse.x, mouse.y)
    }
    onPositionChanged: function(mouse) {
      if (!pressed) return
      var point = mapToItem(monitor, mouse.x, mouse.y)
      var grid = mouse.modifiers & Qt.ControlModifier ? 1 : 10
      view.panel.setEdge(modelData, Edges.fromDrag(modelData, startValue, point.x - startPoint.x, point.y - startPoint.y, view.ratio, grid, view.panel.limit(modelData)))
    }
    onReleased: { view.panel.reserve.hold(false); view.panel.refocus() }
    onCanceled: view.panel.reserve.hold(false)
    onWheel: function(wheel) {
      view.panel.cursor = index
      wheelRest += wheel.angleDelta.y
      var steps = Edges.notches(wheelRest)
      if (!steps) return
      wheelRest -= steps * 120
      // Scrolling down moves the boundary down or right.
      var inward = modelData === "top" || modelData === "left" ? 1 : -1
      view.panel.nudge(modelData, -steps * 10 * inward * (wheel.modifiers & Qt.ShiftModifier ? 10 : 1))
    }
  }
}
