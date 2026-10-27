import QtQuick
import qs.Ui
import qs.Commons
import "Model.js" as Model

// The panel's last row: the shortcuts hint, then Idle, Ruler and
// Clear (or Undo).
Item {
  id: footer
  // The Panel whose output and undo the buttons act on.
  required property var panel
  height: clearButton.implicitHeight
  Text {
    textFormat: Text.PlainText
    anchors.left: parent.left
    anchors.right: idleButton.left
    anchors.rightMargin: Style.spacing.md
    anchors.verticalCenter: parent.verticalCenter
    text: footer.panel.showKeys ? "? hide shortcuts" : "? shortcuts"
    color: footer.panel.subtle
    elide: Text.ElideRight
    font.family: footer.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
  // Session-wide, unlike everything above it.
  Button {
    id: idleButton
    anchors.right: rulerButton.left
    anchors.rightMargin: Style.spacing.md
    text: "Idle  ·  " + Model.idleName(footer.panel.reserve.idleBlack)
    iconText: "󰒲"
    selected: footer.panel.reserve.idleBlack > 0
    bordered: true
    foreground: footer.panel.foreground
    fontFamily: footer.panel.fontFamily
    tooltipText: footer.panel.reserve.idleBlack > 0
      ? "Every edge on every monitor goes black after " + Model.idleName(footer.panel.reserve.idleBlack) + " without input"
      : "Black when idle: off. Click to black out every edge after a while without input"
    onClicked: { footer.panel.cycleIdle(); footer.panel.refocus() }
  }
  Button {
    id: rulerButton
    anchors.right: clearButton.left
    anchors.rightMargin: Style.spacing.md
    text: "Ruler"
    iconText: "󰑭"
    selected: footer.panel.reserve.ruler === footer.panel.output
    bordered: true
    foreground: footer.panel.foreground
    fontFamily: footer.panel.fontFamily
    tooltipText: "Show a ruler on " + footer.panel.output + " to read how much of each edge is hidden"
    onClicked: { footer.panel.toggleRuler(); footer.panel.refocus() }
  }
  Button {
    id: clearButton
    anchors.right: parent.right
    // Turns into Undo right after it (or a zeroed edge) discards values.
    text: footer.panel.canUndo ? "Undo" : "Clear"
    iconText: footer.panel.canUndo ? "󰕌" : "󰅖"
    enabled: footer.panel.canUndo || footer.panel.reserved
    opacity: enabled ? 1 : 0.4
    bordered: true
    foreground: footer.panel.foreground
    fontFamily: footer.panel.fontFamily
    tooltipText: footer.panel.canUndo ? footer.panel.undo.text : "Remove every reserved edge on " + footer.panel.output
    onClicked: {
      if (footer.panel.canUndo) footer.panel.undoLast()
      else footer.panel.clearOutput()
      footer.panel.refocus()
    }
  }
}
