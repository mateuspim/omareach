import QtQuick
import QtQuick.Layouts
import "ModelArt.js" as Art
import "StatsRows.js" as Rows

// The Clock's time in the Clock fill's blocky digits, as big as the room
// the card's rows leave: painted, since a block per cell would be a
// hundred items redone every second.
Canvas {
  id: root
  // The time as StatsClockView gives it ("14:05:30"), "" for no Clock.
  property string digits: ""
  property color tint
  required property int unit
  visible: digits !== ""
  Layout.fillWidth: true
  Layout.fillHeight: true
  Layout.minimumHeight: Math.round(unit * Rows.DIGIT_ROWS)
  readonly property var bitmap: Art.clockBitmap(digits)
  onBitmapChanged: requestPaint()
  onTintChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()
  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    if (!visible || !bitmap.columns) return
    var cell = Math.min(width / bitmap.columns, height / bitmap.rows)
    if (cell >= 2) cell = Math.floor(cell)
    // Centered in their room, across and down: a clock reads as the
    // card's subject, not a number at the start of a line.
    var left = Math.floor((width - cell * bitmap.columns) / 2)
    var top = Math.floor((height - cell * bitmap.rows) / 2)
    ctx.fillStyle = tint
    // Each row's run of lit blocks as one rectangle, reaching a pixel
    // into a lit row below: at a fractional scale (1.67) blocks that
    // only touch leave hairline seams.
    var lit = {}
    for (var i = 0; i < bitmap.cells.length; i++) lit[bitmap.cells[i].x + "," + bitmap.cells[i].y] = true
    for (var y = 0; y < bitmap.rows; y++) {
      for (var x = 0; x < bitmap.columns; x++) {
        if (!lit[x + "," + y]) continue
        var end = x
        var below = false
        while (lit[end + "," + y]) { if (lit[end + "," + (y + 1)]) below = true; end++ }
        ctx.fillRect(left + x * cell, top + y * cell, (end - x) * cell, cell + (below ? 1 : 0))
        x = end
      }
    }
  }
}
