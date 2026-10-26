import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Model.js" as Model

// The calibration ruler: a scale from the middle of every edge to the middle
// of the screen, with a tick every 10 px, a longer one every 50 and the
// distance from that edge every 100. The tick marked N is the first line
// left on screen with N px reserved, so the first tick you can see is about
// how much that edge hides.
Item {
  id: ruler
  property color color: Commons.Color.accent
  property string fontFamily: Style.font.family
  // The labels follow the shell's font size; the band under them grows to
  // hold the widest one ("1000" at most, on a 2000 px edge).
  readonly property int labelSize: Style.font.body
  TextMetrics { id: widest; text: "0000"; font.family: ruler.fontFamily; font.pixelSize: ruler.labelSize; font.bold: true }
  readonly property real bandBeyond: 18 + Math.ceil(widest.width) + 10
  readonly property real bandBelow: 3 + Math.ceil(widest.height) + 4

  Repeater {
    model: Model.EDGES

    Item {
      id: edgeScale
      required property string modelData
      // A top or bottom edge's scale runs down or up the screen.
      readonly property bool vertical: Model.isHorizontal(modelData)
      readonly property real length: Math.floor((vertical ? ruler.height : ruler.width) / 2)
      readonly property real middle: Math.round((vertical ? ruler.width : ruler.height) / 2)
      anchors.fill: parent

      // Where the line `at` px in from this edge starts: rows and columns
      // count from 0, so on the bottom and right edges it is one further in.
      function position(at) {
        if (modelData === "top" || modelData === "left") return at
        return (vertical ? ruler.height : ruler.width) - at - 1
      }

      // A dark band under the scale keeps it readable over any window.
      Rectangle {
        readonly property real start: Math.min(edgeScale.position(0), edgeScale.position(edgeScale.length))
        x: edgeScale.vertical ? edgeScale.middle - 20 : start
        y: edgeScale.vertical ? start : edgeScale.middle - 20
        width: edgeScale.vertical ? 20 + ruler.bandBeyond : edgeScale.length + 1
        height: edgeScale.vertical ? edgeScale.length + 1 : 20 + ruler.bandBelow
        color: "black"
        opacity: 0.55
      }

      readonly property var ticks: Model.rulerTicks(length)

      Repeater {
        model: edgeScale.ticks

        Rectangle {
          required property var modelData
          readonly property real reach: [0, 8, 16, 30][modelData.size]
          x: edgeScale.vertical ? edgeScale.middle - reach / 2 : edgeScale.position(modelData.at)
          y: edgeScale.vertical ? edgeScale.position(modelData.at) : edgeScale.middle - reach / 2
          width: edgeScale.vertical ? reach : 1
          height: edgeScale.vertical ? 1 : reach
          color: ruler.color
        }
      }

      // Only every tenth tick has a label, so only those get a Text.
      Repeater {
        model: edgeScale.ticks.filter(function(tick) { return tick.label !== "" })

        Text {
          required property var modelData
          textFormat: Text.PlainText
          text: modelData.label
          color: ruler.color
          font.family: ruler.fontFamily
          font.pixelSize: ruler.labelSize
          font.bold: true
          x: edgeScale.vertical ? edgeScale.middle + 18 : edgeScale.position(modelData.at) - Math.round(implicitWidth / 2)
          y: edgeScale.vertical ? edgeScale.position(modelData.at) - Math.round(implicitHeight / 2) : edgeScale.middle + 3
        }
      }
    }
  }
}
