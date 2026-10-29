import QtQuick
import QtQuick.Controls

// Hover text over the strip, in the card's own look: what a label names
// in full, or the rest of one cut short. The strips are layer surfaces
// of their own, so the tip opens inside the strip it belongs to.
// It is made only while its text is hovered: every row of every card
// has one, some hundred popups across a dashboard otherwise. A Loader
// takes only Items, so the tip comes in one.
Loader {
  id: lazyTip
  // The StatsCard whose look the tip takes.
  required property Item statsCard
  property bool shown: false
  property string text: ""
  anchors.fill: parent
  active: shown && text !== ""
  sourceComponent: Component {
    Item {
      ToolTip {
        id: cardTip
        visible: text !== ""
        text: lazyTip.text
        delay: 300
        padding: Math.round(lazyTip.statsCard.unit * 0.45)
        background: Rectangle {
          color: "black"
          border.color: lazyTip.statsCard.outline
          border.width: lazyTip.statsCard.line
          radius: Math.round(lazyTip.statsCard.unit * 0.3)
        }
        contentItem: Text {
          textFormat: Text.PlainText
          text: cardTip.text
          color: lazyTip.statsCard.theme.foreground
          font.family: lazyTip.statsCard.fontFamily
          font.pixelSize: Math.round(lazyTip.statsCard.unit * 0.9)
        }
      }
    }
  }
}
