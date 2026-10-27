import QtQuick
import qs.Commons

// The panel's shortcut sheet, toggled with ?.
Grid {
  id: sheet
  // The Panel whose keys these are, for its colors and font.
  required property var panel
  visible: sheet.panel.showKeys
  columns: 2
  columnSpacing: Style.spacing.lg
  rowSpacing: Style.spacing.xs
  Repeater {
    model: [
      "[ / ]", "Previous / next page",
      "J / K", "Edges: select edge  ·  other pages: move the cursor",
      "H / L", "Edges: shrink / grow 10 px  ·  ⇧ 100  ·  Ctrl 1",
      "0", "Zero edge (brings up Edges)",
      "⌫ / Del", "Edges: zero edge  ·  other pages: as X",
      "Enter", "Press the button under the cursor  ·  ⇧ right-click it",
      "X", "Hide a stats panel, delete a profile",
      "⇧ J / K", "Move a stats panel earlier / later",
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
      color: index % 2 === 0 ? sheet.panel.foreground : sheet.panel.subtle
      font.family: sheet.panel.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: index % 2 === 0
    }
  }
}
