import QtQuick
import "." as Reserve

// Label, a meter when there is a fraction, and the value on the right.
// With `labelFills` the label takes the free width and the meter a fixed
// one, as in the process lists.
Item {
  id: statRow
  // The StatsCard whose columns, theme and size the row follows.
  required property Item statsCard
  property string label
  property string text
  property var fraction: null
  property color barColor
  property real labelWidth: 0
  property bool labelFills: false
  property real meterWidth: 0
  // A square of barColor before the label: the key to a stacked bar.
  property bool swatch: false
  // Shown on hover over the row, as is a label cut short.
  property string tip: ""
  readonly property bool hasMeter: fraction !== null && fraction !== undefined
  // Where the label starts: after the swatch and its gap. Worked out
  // here, not read off rowLabel.x, which the anchors update with the
  // width and made a binding loop.
  readonly property real labelX: swatch ? Math.round(statRow.statsCard.unit * 0.6) + Math.round(statRow.statsCard.unit * 0.4) : 0
  // A meter row of the card's rows that lines up with the others; one
  // whose value is too long for the card's value column has no meter.
  readonly property bool columns: hasMeter && !labelFills && statRow.statsCard.valueWidth(text) <= statRow.statsCard.valueColumn && statRow.statsCard.valueColumn > 0
  readonly property bool meterless: hasMeter && !labelFills && !columns
  implicitHeight: Math.round(statRow.statsCard.unit * 1.25)

  Rectangle {
    id: swatchBox
    visible: statRow.swatch
    anchors.verticalCenter: parent.verticalCenter
    width: visible ? Math.round(statRow.statsCard.unit * 0.6) : 0
    height: width
    radius: Math.max(1, Math.round(statRow.statsCard.unit / 8))
    color: statRow.barColor
  }
  Text {
    id: rowLabel
    textFormat: Text.PlainText
    anchors.left: swatchBox.visible ? swatchBox.right : parent.left
    anchors.leftMargin: swatchBox.visible ? Math.round(statRow.statsCard.unit * 0.4) : 0
    anchors.verticalCenter: parent.verticalCenter
    // Never into the value: a long value takes the room of the meter,
    // then of the label, which elides.
    // A long label ("G502 X LIGHTSPEED") takes up to half the row from
    // the meter. A row with a meter uses the card's label column.
    width: statRow.labelFills ? parent.width - value.width - meter.width - statRow.statsCard.unit * 1.2
      : statRow.columns ? statRow.statsCard.labelColumn
      : Math.max(0, Math.min(Math.max(statRow.labelWidth, Math.min(implicitWidth + statRow.statsCard.unit * 0.6, parent.width * 0.5)),
          parent.width - statRow.labelX - value.width - statRow.statsCard.unit * 0.6))
    text: statRow.label
    elide: Text.ElideRight
    color: statRow.statsCard.theme.subtle
    font.family: statRow.statsCard.fontFamily
    font.pixelSize: Math.round(statRow.statsCard.unit * 0.9)
  }
  Rectangle {
    id: meter
    // A meter squeezed to a dot says nothing.
    visible: statRow.hasMeter && !statRow.meterless && width >= statRow.statsCard.unit * 2
    anchors.verticalCenter: parent.verticalCenter
    x: statRow.labelFills ? rowLabel.width + statRow.statsCard.unit * 0.6 : rowLabel.width
    width: !statRow.hasMeter ? 0 : statRow.labelFills ? statRow.meterWidth : Math.max(0, value.x - x - statRow.statsCard.unit * 0.6)
    height: Math.max(3, Math.round(statRow.statsCard.unit * 0.42))
    radius: height / 2
    color: statRow.statsCard.theme.meter
    Reserve.StatsEase { id: meterShown; target: statRow.fraction || 0 }
    Rectangle {
      width: Math.max(parent.height, parent.width * meterShown.value)
      height: parent.height
      radius: parent.radius
      color: statRow.barColor
    }
  }
  Text {
    id: value
    textFormat: Text.PlainText
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    // Never over the label: it takes the room the label can spare (all
    // but a short label's own width), and past that it elides. A row
    // with a meter takes the card's value column, right-aligned in it.
    // The label starts after a swatch (labelX): leaving it out ran the
    // Network card's "VPN" into its value.
    width: statRow.columns ? statRow.statsCard.valueColumn
      : Math.min(implicitWidth, parent.width - statRow.labelX - Math.min(rowLabel.implicitWidth, statRow.statsCard.unit * 3) - statRow.statsCard.unit * 0.6)
    horizontalAlignment: Text.AlignRight
    elide: Text.ElideRight
    text: statRow.text
    color: statRow.statsCard.theme.foreground
    font.family: statRow.statsCard.fontFamily
    font.pixelSize: Math.round(statRow.statsCard.unit * 0.9)
    font.bold: true
  }
  HoverHandler { id: rowHover }
  Reserve.StatsTip { statsCard: statRow.statsCard; shown: rowHover.hovered; text: statRow.tip || (rowLabel.truncated ? statRow.label : "") }
}
