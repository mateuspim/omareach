import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import "." as Reserve
import "Stats.js" as Stats
import "StatsFormat.js" as Format
import "StatsRows.js" as Rows
import "StatsTiles.js" as Tiles
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
  // The panel preview's key to the Stats page: the card's number in that
  // page's list over the card (0 for none), filled in when it is the one
  // selected there.
  property int badge: 0
  property bool picked: false
  property string fontFamily: Style.font.family
  // The panel it draws, for the Clock's rule of when to go wide.
  property string panel: ""
  readonly property bool wide: Tiles.wideCard(panel, width, height, unit)
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
  readonly property color outline: alert >= Rows.ALERT ? theme.alert : alert === Rows.CAUTION ? theme.caution : shown.color
  readonly property bool critical: alert >= Rows.CRITICAL

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
      Reserve.StatsTip { statsCard: card; shown: infoHover.hovered && infoText.truncated; text: card.shown.info }
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
      Layout.fillHeight: card.wide || card.shown.graphs.length > 0 || card.shown.digits !== ""
      Layout.alignment: Qt.AlignTop
      // Side by side the rows' text needs more of the width than the graph.
      // The Clock's digits take what its short rows leave.
      Layout.preferredWidth: card.shown.digits !== "" ? 5 : 2
      spacing: Math.round(card.unit * 0.4)
      visible: card.shown.digits !== "" || card.shown.value !== "" || card.shown.graphs.length > 0 || card.shown.bars.length > 0 || card.shown.stack.length > 0

      Reserve.StatsDigits {
        digits: card.shown.digits
        tint: card.shown.valueColor
        unit: card.unit
      }

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
          Reserve.StatsTip { statsCard: card; shown: captionHover.hovered; text: card.shown.captionTip || (captionText.truncated ? card.shown.caption : "") }
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
        Reserve.StatsTip { statsCard: card; shown: noteHover.hovered; text: card.shown.noteTip || (noteText.truncated ? card.shown.note : "") }
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
      Item { Layout.fillHeight: true; visible: card.wide && card.shown.graphs.length === 0 && card.shown.digits === "" }
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
      Layout.maximumWidth: card.unit * (card.shown.digits !== "" ? 24 : 32)
      Layout.alignment: Qt.AlignTop
      spacing: Math.round(card.unit * 0.35)
      visible: card.shown.rows.length > 0 || card.shown.lists.length > 0

      Repeater {
        model: card.shown.rows.length
        Reserve.StatsRow {
          statsCard: card
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
            Reserve.StatsRow {
              statsCard: card
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

  Reserve.StatsMedia { statsCard: card }

  Text {
    textFormat: Text.PlainText
    anchors.centerIn: parent
    visible: card.shown.empty !== ""
    text: card.shown.empty
    color: card.theme.subtle
    font.family: card.fontFamily
    font.pixelSize: card.unit
  }

  // Drawn at the strip's size and scaled down with it, so it is as big as
  // the card allows: the preview is a few dozen pixels high.
  Rectangle {
    visible: card.badge > 0
    readonly property real size: Math.min(card.width, card.height) * 0.55
    anchors.centerIn: parent
    width: size
    height: size
    radius: size / 2
    color: card.picked ? card.shown.color : "black"
    opacity: 0.9
    border.color: card.shown.color
    border.width: Math.max(1, size / 14)
    Text {
      textFormat: Text.PlainText
      anchors.centerIn: parent
      text: String(card.badge)
      color: card.picked ? "black" : card.shown.color
      font.family: card.fontFamily
      font.pixelSize: Math.round(parent.size * 0.6)
      font.bold: true
    }
  }
}

