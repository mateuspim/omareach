import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import "." as Reserve
import "Stats.js" as Stats
import "StatsFormat.js" as Format
import "StatsViews.js" as Views

// One panel of the stats dashboard, drawn the way btop draws its boxes: a
// thin rounded outline in the panel's color with the title cut into its
// top edge, over black. `view` is Views.view's description of the panel.
// A wide card puts its value and graphs on the left and its rows on the
// right; a narrow one stacks them.
// Text stays plain: MPRIS metadata and device/process names can be supplied
// by other processes, and Qt's AutoText would interpret markup in them.
Item {
  id: card
  // Blank until set: a delegate's own bindings can run before these are
  // given, and would read undefined.
  property var view: blank
  readonly property var blank: Views.view("", Stats.empty(), Format.palette({}, {}))
  // What the card draws: `view`, or blank while a binding gives none.
  readonly property var shown: view || blank
  // Not `palette`: that would hide Item.palette.
  property var theme: Format.palette({}, {})
  required property int unit
  property string fontFamily: Style.font.family
  readonly property bool wide: width > height * Views.WIDE_CARD
  // Omarchy's icon beside a view that asks for it (System), as fastfetch
  // shows the distro's: as tall as the body, when that leaves the rows
  // room enough (a label and a short value, about 13 units).
  readonly property real bodyHeight: height - Math.round(unit * 1.6) - unit
  readonly property real logoSize: Math.min(bodyHeight, width * 0.3)
  readonly property bool showsLogo: shown.logo === true && Reserve.ReserveState.iconArt !== null
    && logoSize >= unit * 4 && width - 3 * unit - logoSize >= unit * 13
  readonly property int line: Math.max(1, Math.round(unit / 12))
  // A view that asks for attention trades its hue for the caution or
  // alarm color, in a thicker, solid outline, with a warning mark for its
  // icon; at CRITICAL the title is filled in as well.
  readonly property int alert: shown.alert || 0
  readonly property color outline: alert >= Views.ALERT ? theme.alert : alert === Views.CAUTION ? theme.caution : shown.color
  readonly property bool critical: alert >= Views.CRITICAL

  // The rows with meters share a label column and a value column, so
  // their meters start and end together. The value column is as wide as
  // the longest value that still leaves a meter room (two units): a
  // longer value ("6.2 / 16.0 GiB" in a narrow card) keeps its text whole
  // and goes without a meter, rather than squeezing every other meter out.
  readonly property var meterRows: shown.rows.filter(function(r) { return r.fraction !== null && r.fraction !== undefined })
  readonly property real labelColumn: Math.min(Math.max(unit * 4, longest(meterRows, "label") * labelGlyph.advanceWidth + unit * 0.6), rowsColumn.width * 0.45)
  readonly property real valueColumn: {
    var room = rowsColumn.width - labelColumn - unit * 0.6 * 2 - unit * 2
    var widest = 0
    for (var i = 0; i < meterRows.length; i++) {
      var width = valueWidth(meterRows[i].text)
      if (width <= room && width > widest) widest = width
    }
    return widest
  }
  function valueWidth(text) { return String(text || "").length * valueGlyph.advanceWidth }
  function longest(rows, key) {
    var most = 0
    for (var i = 0; i < rows.length; i++) most = Math.max(most, String(rows[i][key] || "").length)
    return most
  }
  // The font is monospaced, so one glyph's advance measures any text.
  TextMetrics { id: labelGlyph; text: "0"; font.family: card.fontFamily; font.pixelSize: Math.round(card.unit * 0.9) }
  TextMetrics { id: valueGlyph; text: "0"; font.family: card.fontFamily; font.pixelSize: Math.round(card.unit * 0.9); font.bold: true }

  Rectangle {
    anchors.fill: parent
    anchors.topMargin: Math.round(card.unit / 2)
    color: "transparent"
    radius: Math.round(card.unit * 0.55)
    border.color: card.outline
    border.width: card.alert ? card.line * 2 : card.line
    opacity: card.alert ? 1 : 0.75
  }

  // The title, and on the right the panel's detail (a GPU's name, the
  // number of threads), each on a black patch over the outline.
  Rectangle {
    x: card.unit
    height: card.unit
    width: titleRow.implicitWidth + card.unit * 0.7
    radius: card.critical ? Math.round(card.unit * 0.3) : 0
    color: card.critical ? card.outline : "black"
    Row {
      id: titleRow
      anchors.centerIn: parent
      spacing: Math.round(card.unit * 0.4)
      Text {
        textFormat: Text.PlainText
        // A warning mark for the panel's icon while it asks for attention.
        text: card.alert ? "\u{f0026}" : card.shown.icon
        color: card.critical ? "black" : card.outline
        font.family: card.fontFamily
        font.pixelSize: card.unit
      }
      Text {
        textFormat: Text.PlainText
        text: card.shown.title
        color: card.critical ? "black" : card.alert ? card.outline : card.theme.foreground
        font.family: card.fontFamily
        font.pixelSize: Math.round(card.unit * 0.9)
        font.bold: true
      }
    }
  }
  Rectangle {
    visible: card.shown.info !== ""
    anchors.right: parent.right
    anchors.rightMargin: card.unit
    height: card.unit
    width: Math.min(infoText.implicitWidth, card.width / 2) + card.unit * 0.7
    color: "black"
    Text {
      id: infoText
      textFormat: Text.PlainText
      anchors.centerIn: parent
      width: Math.min(implicitWidth, card.width / 2)
      text: card.shown.info
      elide: Text.ElideRight
      color: card.theme.subtle
      font.family: card.fontFamily
      font.pixelSize: Math.round(card.unit * 0.8)
      HoverHandler { id: infoHover }
      LazyTip { shown: infoHover.hovered && infoText.truncated; text: card.shown.info }
    }
  }

  Canvas {
    id: logo
    visible: card.showsLogo
    x: card.unit
    y: Math.round(card.unit * 1.6) + (card.bodyHeight - height) / 2
    width: card.logoSize
    height: card.logoSize
    // Not `art`: that is the cover's id.
    readonly property var blocks: Reserve.ReserveState.iconArt
    readonly property color tint: card.shown.color
    onBlocksChanged: requestPaint()
    onTintChanged: requestPaint()
    onWidthChanged: requestPaint()
    onVisibleChanged: requestPaint()
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      if (!visible || !blocks || !blocks.columns) return
      var cell = Math.floor(width / Math.max(blocks.columns, blocks.rows))
      if (cell < 1) return
      var left = Math.floor((width - cell * blocks.columns) / 2), top = Math.floor((height - cell * blocks.rows) / 2)
      ctx.fillStyle = tint
      for (var i = 0; i < blocks.cells.length; i++) ctx.fillRect(left + blocks.cells[i].x * cell, top + blocks.cells[i].y * cell, cell, cell)
    }
  }

  GridLayout {
    id: body
    anchors.fill: parent
    anchors.margins: card.unit
    anchors.topMargin: Math.round(card.unit * 1.6)
    anchors.leftMargin: card.showsLogo ? card.unit * 2 + card.logoSize : card.unit
    columns: card.wide ? 2 : 1
    columnSpacing: card.unit * 1.2
    rowSpacing: Math.round(card.unit * 0.5)
    visible: card.shown.empty === ""
    clip: true

    // The headline: the big value, its graphs and the per-core bars. Only
    // its graphs take the free height in a stacked card; without one, the
    // rows follow right under the value.
    ColumnLayout {
      Layout.fillWidth: true
      Layout.fillHeight: card.wide || card.shown.graphs.length > 0
      Layout.alignment: Qt.AlignTop
      // Side by side the rows' text needs more of the width than the graph.
      Layout.preferredWidth: 2
      spacing: Math.round(card.unit * 0.4)
      visible: card.shown.value !== "" || card.shown.graphs.length > 0 || card.shown.bars.length > 0 || card.shown.stack.length > 0

      RowLayout {
        visible: card.shown.value !== ""
        spacing: Math.round(card.unit * 0.5)
        TextMetrics {
          id: widest
          text: "100%"
          font.family: card.fontFamily
          font.pixelSize: Math.round(card.unit * 2.2)
          font.bold: true
        }
        Text {
          textFormat: Text.PlainText
          // As wide as the widest value, so the caption holds still.
          Layout.minimumWidth: widest.width
          text: card.shown.value
          color: card.shown.valueColor
          font.family: card.fontFamily
          font.pixelSize: Math.round(card.unit * 2.2)
          font.bold: true
        }
        Text {
          id: captionText
          textFormat: Text.PlainText
          Layout.alignment: Qt.AlignBottom
          Layout.bottomMargin: Math.round(card.unit * 0.3)
          Layout.fillWidth: true
          elide: Text.ElideRight
          text: card.shown.caption
          color: card.theme.subtle
          font.family: card.fontFamily
          font.pixelSize: Math.round(card.unit * 0.8)
          HoverHandler { id: captionHover }
          LazyTip { shown: captionHover.hovered; text: card.shown.captionTip || (captionText.truncated ? card.shown.caption : "") }
        }
      }
      // What the caption had no room for (a wide card's sensor name), or
      // how low a battery is, in the warning's color.
      Text {
        id: noteText
        textFormat: Text.PlainText
        visible: card.shown.note !== ""
        Layout.fillWidth: true
        elide: Text.ElideRight
        HoverHandler { id: noteHover }
        LazyTip { shown: noteHover.hovered; text: card.shown.noteTip || (noteText.truncated ? card.shown.note : "") }
        text: card.shown.note
        color: card.alert ? card.outline : card.theme.subtle
        font.family: card.fontFamily
        font.pixelSize: Math.round(card.unit * 0.8)
        font.bold: card.alert > 0
      }

      // Each repeater counts the view's items rather than taking its
      // arrays, which are new every second: its delegates then stay, and
      // their meters and graphs move instead of being made again.
      Repeater {
        model: card.shown.graphs.length
        Item {
          required property int index
          readonly property var modelData: card.shown.graphs[index] || ({ values: [], max: 1, stops: card.theme.gradients.cpu, label: "" })
          Layout.fillWidth: true
          Layout.fillHeight: true
          Layout.minimumHeight: card.unit * 1.5
          Reserve.StatsGraph {
            anchors.fill: parent
            values: parent.modelData.values
            maximum: parent.modelData.max
            stops: parent.modelData.stops
            duration: Reserve.ReserveState.stats.interval * 1000
            guideColor: card.theme.line
            lineWidth: Math.max(1.5, card.unit / 9)
          }
          Text {
            textFormat: Text.PlainText
            visible: parent.modelData.label !== ""
            x: Math.round(card.unit * 0.3)
            y: Math.round(card.unit * 0.1)
            text: parent.modelData.label
            color: parent.modelData.stops[1]
            font.family: card.fontFamily
            font.pixelSize: Math.round(card.unit * 0.85)
            font.bold: true
            style: Text.Outline
            styleColor: "black"
          }
        }
      }

      // Parts of a whole in one bar (memory: used, then cached), keyed by
      // the rows' swatches.
      Rectangle {
        id: stack
        visible: card.shown.stack.length > 0
        Layout.fillWidth: true
        Layout.preferredHeight: Math.max(4, Math.round(card.unit * 0.7))
        radius: height / 2
        color: card.theme.meter
        clip: true
        Row {
          anchors.fill: parent
          Repeater {
            model: card.shown.stack.length
            Rectangle {
              id: part
              required property int index
              readonly property var modelData: card.shown.stack[index] || ({ fraction: 0, color: card.theme.meter })
              Reserve.StatsEase { id: partShown; target: part.modelData.fraction }
              width: Math.round(stack.width * partShown.value)
              height: stack.height
              color: modelData.color
            }
          }
        }
      }

      // One bar per core, filled from the bottom.
      Row {
        id: cores
        visible: card.shown.bars.length > 0
        Layout.fillWidth: true
        Layout.preferredHeight: Math.round(card.unit * 1.8)
        spacing: Math.max(1, Math.round(card.unit / 8))
        Repeater {
          model: card.shown.bars.length
          Rectangle {
            id: coreBar
            required property int index
            readonly property var modelData: card.shown.bars[index] || ({ fraction: 0, color: card.theme.meter, gap: false })
            width: Math.max(1, (cores.width - cores.spacing * (card.shown.bars.length - 1)) / card.shown.bars.length)
            height: cores.height
            radius: Math.min(width / 2, card.unit / 6)
            // A gap between a hybrid CPU's kinds of core draws nothing.
            opacity: modelData.gap ? 0 : 1
            color: card.theme.meter
            // The fraction eases, not the size: an eased size would keep
            // a stale track size when the card is laid out again.
            // By id: a QtObject has no parent, so `parent` here would be
            // the bar's.
            Reserve.StatsEase { id: coreShown; target: coreBar.modelData.fraction }
            Rectangle {
              anchors.bottom: parent.bottom
              width: parent.width
              height: Math.max(parent.radius * 2, parent.height * coreShown.value)
              radius: parent.radius
              color: parent.modelData.color
            }
          }
        }
      }
      // Beside the rows of a wide card, a headline without a graph keeps to
      // the top like every other card's, rather than floating in the middle.
      Item { Layout.fillHeight: true; visible: card.wide && card.shown.graphs.length === 0 }
    }

    // The details: label, meter and value rows, then ranked lists. No
    // wider than this: across a very wide card a label and its value
    // drift too far apart to read as one, and the graphs beside them make
    // better use of the width. 32 units still holds the CPU's load row.
    ColumnLayout {
      id: rowsColumn
      Layout.fillWidth: true
      Layout.fillHeight: card.wide
      Layout.preferredWidth: 3
      Layout.maximumWidth: card.unit * 32
      Layout.alignment: Qt.AlignTop
      spacing: Math.round(card.unit * 0.35)
      visible: card.shown.rows.length > 0 || card.shown.lists.length > 0

      Repeater {
        model: card.shown.rows.length
        StatRow {
          required property int index
          readonly property var modelData: card.shown.rows[index] || ({ label: "", text: "", fraction: null, color: "", swatch: false })
          Layout.fillWidth: true
          label: modelData.label
          text: modelData.text
          fraction: modelData.fraction
          barColor: modelData.color || card.shown.color
          swatch: modelData.swatch === true
          tip: modelData.tip || ""
          labelWidth: card.unit * 5.5
        }
      }

      Repeater {
        model: card.shown.lists.length
        ColumnLayout {
          id: list
          required property int index
          readonly property var modelData: card.shown.lists[index] || ({ title: "", items: [] })
          Layout.fillWidth: true
          spacing: Math.round(card.unit * 0.3)
          // A list of one line per resource has no title.
          Text {
            textFormat: Text.PlainText
            visible: text !== ""
            text: list.modelData.title
            color: card.shown.color
            font.family: card.fontFamily
            font.pixelSize: Math.round(card.unit * 0.8)
            font.bold: true
          }
          Repeater {
            model: list.modelData.items.length
            StatRow {
              required property int index
              readonly property var modelData: list.modelData.items[index] || ({ name: "", text: "", fraction: null, color: "" })
              Layout.fillWidth: true
              label: modelData.name
              text: modelData.text
              fraction: modelData.fraction
              barColor: modelData.color
              labelFills: true
              meterWidth: card.unit * 4
            }
          }
          Text {
            textFormat: Text.PlainText
            visible: list.modelData.items.length === 0
            text: "Nothing busy"
            color: card.theme.subtle
            font.family: card.fontFamily
            font.pixelSize: Math.round(card.unit * 0.85)
          }
        }
      }
      Item { Layout.fillHeight: true; visible: card.wide }
    }
  }

  // Now playing: the cover beside the title, artist, album and a progress
  // bar with the time.
  Item {
    id: media
    readonly property var track: card.shown.media || null
    visible: track !== null && card.shown.empty === ""
    anchors.fill: parent
    anchors.margins: card.unit
    anchors.topMargin: Math.round(card.unit * 1.6)

    Rectangle {
      id: cover
      width: Math.min(parent.height, parent.width * 0.4)
      height: width
      anchors.verticalCenter: parent.verticalCenter
      radius: Math.round(card.unit * 0.4)
      color: card.theme.meter
      // Only beside room for the title: a narrow card is all text.
      visible: width >= card.unit * 3 && parent.width - width - card.unit >= card.unit * 14
      Text {
        textFormat: Text.PlainText
        anchors.centerIn: parent
        visible: art.status !== Image.Ready
        text: card.shown.icon
        color: card.shown.color
        font.family: card.fontFamily
        font.pixelSize: Math.round(parent.width * 0.4)
      }
      Image {
        id: art
        anchors.fill: parent
        source: media.track ? media.track.art : ""
        sourceSize.width: Math.ceil(width)
        sourceSize.height: Math.ceil(height)
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        smooth: true
      }
    }

    Column {
      anchors.left: cover.visible ? cover.right : parent.left
      anchors.leftMargin: cover.visible ? card.unit : 0
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      spacing: Math.round(card.unit * 0.35)
      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: media.track ? media.track.title : ""
        elide: Text.ElideRight
        color: card.theme.foreground
        font.family: card.fontFamily
        font.pixelSize: Math.round(card.unit * 1.3)
        font.bold: true
      }
      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: text !== ""
        text: media.track ? media.track.artist : ""
        elide: Text.ElideRight
        color: card.shown.color
        font.family: card.fontFamily
        font.pixelSize: card.unit
      }
      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: text !== ""
        text: media.track ? media.track.album : ""
        elide: Text.ElideRight
        color: card.theme.subtle
        font.family: card.fontFamily
        font.pixelSize: Math.round(card.unit * 0.85)
      }
      Item { width: 1; height: Math.round(card.unit * 0.3) }
      StatRow {
        width: parent.width
        // A player that gives no length shows no time.
        visible: media.track !== null && (media.track.time !== "" || media.track.progress !== null)
        label: media.track && media.track.playing ? "\u{f040a}" : "\u{f03e4}"
        labelWidth: card.unit * 1.6
        text: media.track ? media.track.time : ""
        fraction: media.track ? media.track.progress : null
        barColor: card.shown.color
      }
    }
  }

  Text {
    textFormat: Text.PlainText
    anchors.centerIn: parent
    visible: card.shown.empty !== ""
    text: card.shown.empty
    color: card.theme.subtle
    font.family: card.fontFamily
    font.pixelSize: card.unit
  }

  // Hover text over the strip, in the card's own look: what a label names
  // in full, or the rest of one cut short. The strips are layer surfaces
  // of their own, so the tip opens inside the strip it belongs to.
  component CardTip: ToolTip {
    id: cardTip
    property bool shown: false
    visible: shown && text !== ""
    delay: 300
    padding: Math.round(card.unit * 0.45)
    background: Rectangle {
      color: "black"
      border.color: card.outline
      border.width: card.line
      radius: Math.round(card.unit * 0.3)
    }
    contentItem: Text {
      textFormat: Text.PlainText
      text: cardTip.text
      color: card.theme.foreground
      font.family: card.fontFamily
      font.pixelSize: Math.round(card.unit * 0.9)
    }
  }

  // A CardTip made only while its text is hovered: every row of every card
  // has one, some hundred popups across a dashboard otherwise. A Loader
  // takes only Items, so the tip comes in one.
  component LazyTip: Loader {
    id: lazyTip
    property bool shown: false
    property string text: ""
    anchors.fill: parent
    active: shown && text !== ""
    sourceComponent: Component {
      Item {
        CardTip { shown: true; text: lazyTip.text }
      }
    }
  }

  // Label, a meter when there is a fraction, and the value on the right.
  // With `labelFills` the label takes the free width and the meter a fixed
  // one, as in the process lists.
  component StatRow: Item {
    id: statRow
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
    // A meter row of the card's rows that lines up with the others; one
    // whose value is too long for the card's value column has no meter.
    readonly property bool columns: hasMeter && !labelFills && card.valueWidth(text) <= card.valueColumn && card.valueColumn > 0
    readonly property bool meterless: hasMeter && !labelFills && !columns
    implicitHeight: Math.round(card.unit * 1.25)

    Rectangle {
      id: swatchBox
      visible: statRow.swatch
      anchors.verticalCenter: parent.verticalCenter
      width: visible ? Math.round(card.unit * 0.6) : 0
      height: width
      radius: Math.max(1, Math.round(card.unit / 8))
      color: statRow.barColor
    }
    Text {
      id: rowLabel
      textFormat: Text.PlainText
      anchors.left: swatchBox.visible ? swatchBox.right : parent.left
      anchors.leftMargin: swatchBox.visible ? Math.round(card.unit * 0.4) : 0
      anchors.verticalCenter: parent.verticalCenter
      // Never into the value: a long value takes the room of the meter,
      // then of the label, which elides.
      // A long label ("G502 X LIGHTSPEED") takes up to half the row from
      // the meter. A row with a meter uses the card's label column.
      width: statRow.labelFills ? parent.width - value.width - meter.width - card.unit * 1.2
        : statRow.columns ? card.labelColumn
        : Math.max(0, Math.min(Math.max(statRow.labelWidth, Math.min(implicitWidth + card.unit * 0.6, parent.width * 0.5)),
            parent.width - value.width - card.unit * 0.6))
      text: statRow.label
      elide: Text.ElideRight
      color: card.theme.subtle
      font.family: card.fontFamily
      font.pixelSize: Math.round(card.unit * 0.9)
    }
    Rectangle {
      id: meter
      // A meter squeezed to a dot says nothing.
      visible: statRow.hasMeter && !statRow.meterless && width >= card.unit * 2
      anchors.verticalCenter: parent.verticalCenter
      x: statRow.labelFills ? rowLabel.width + card.unit * 0.6 : rowLabel.width
      width: !statRow.hasMeter ? 0 : statRow.labelFills ? statRow.meterWidth : Math.max(0, value.x - x - card.unit * 0.6)
      height: Math.max(3, Math.round(card.unit * 0.42))
      radius: height / 2
      color: card.theme.meter
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
      width: statRow.columns ? card.valueColumn
        : Math.min(implicitWidth, parent.width - Math.min(rowLabel.implicitWidth, card.unit * 3) - card.unit * 0.6)
      horizontalAlignment: Text.AlignRight
      elide: Text.ElideRight
      text: statRow.text
      color: card.theme.foreground
      font.family: card.fontFamily
      font.pixelSize: Math.round(card.unit * 0.9)
      font.bold: true
    }
    HoverHandler { id: rowHover }
    LazyTip { shown: rowHover.hovered; text: statRow.tip || (rowLabel.truncated ? statRow.label : "") }
  }
}
