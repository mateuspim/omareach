import QtQuick
import QtQuick.Window
import qs.Commons
import qs.Commons as Commons
import "." as Reserve
import "Model.js" as Model

// What one reserved edge shows, drawn over black (or the theme background)
// so a missing or loading image falls back to the plain cap. The service draws it at screen size;
// the panel preview draws the same thing scaled down, so `size`,
// `screenWidth` and `screenHeight` are in whatever units the parent uses.
Rectangle {
  id: fill
  required property string side
  required property string mode
  required property real size
  required property real screenWidth
  required property real screenHeight
  // How dark the dimmed fill is, 0 to 1.
  property real dim: Model.DIM_DEFAULT / 100
  property color logoColor: Commons.Color.foreground
  property color clockColor: Commons.Color.accent
  // The clock's hours (24 or 12), and whether it shows the date under the
  // time where the edge is tall enough.
  property int clockHours: 24
  property bool clockDate: false
  // The stats fill's panels, and how many strip pixels one screen pixel
  // takes up: 1 on the monitor, the preview's scale in the panel.
  property var panels: []
  property real pixelRatio: 1
  readonly property bool horizontal: Model.isHorizontal(side)
  // The time the clock shows, and what the clock and the logo shift by
  // against burn-in (clockShift). Only ticks while one of them is shown.
  property date now: new Date()
  readonly property var shift: Model.clockShift(now)
  color: mode === "theme" ? Commons.Color.background : "black"
  clip: true

  // The slice of the wallpaper that would be on screen here, scaled and
  // cropped the way Omarchy's background layer does it. It is decoded at
  // the screen's size in device pixels (or the preview's), not the image's:
  // every strip is its own window with its own copy of the texture, and a
  // 5K wallpaper is some 60 MB at full size.
  Image {
    readonly property var offset: Model.imageOffset(fill.side, fill.size, fill.screenWidth, fill.screenHeight)
    visible: Model.showsWallpaper(fill.mode)
    x: offset.x
    y: offset.y
    width: fill.screenWidth
    height: fill.screenHeight
    source: visible ? Util.fileUrl(Reserve.ReserveState.wallpaper) : ""
    sourceSize.width: Math.ceil(fill.screenWidth * Screen.devicePixelRatio)
    sourceSize.height: Math.ceil(fill.screenHeight * Screen.devicePixelRatio)
    fillMode: Image.PreserveAspectCrop
    asynchronous: true
    cache: true
    smooth: true

    // The dimmed fill: the same slice under a translucent black.
    Rectangle {
      anchors.fill: parent
      visible: fill.mode === "dim"
      color: "black"
      opacity: fill.dim
    }
  }

  // The Omarchy logo, centered and upright: the wordmark on the top and
  // bottom edges, the icon over it on the sides. The SVG is drawn in black, so its fill is
  // swapped for the theme's foreground; the icon is block art, drawn in it.
  Column {
    id: logo
    readonly property string svg: Reserve.ReserveState.logoSvg
    readonly property real aspect: Model.svgAspect(svg, 4)
    readonly property var layout: Model.logoLayout(fill.width, fill.height, aspect, Reserve.ReserveState.iconArt, !fill.horizontal)
    readonly property real step: Model.logoStep(width, height)
    visible: fill.mode === "logo" && svg !== "" && layout.width / aspect >= 4
    x: Math.round((fill.width - width) / 2 + fill.shift.x * step)
    y: Math.round((fill.height - height) / 2 + fill.shift.y * step)
    spacing: layout.gap

    Item {
      visible: logo.layout.stacked
      width: logo.layout.width
      height: visible ? Reserve.ReserveState.iconArt.rows * logo.layout.cell : 0
      Repeater {
        model: logo.visible && logo.layout.stacked ? Reserve.ReserveState.iconArt.cells : []
        Rectangle {
          required property var modelData
          x: modelData.x * logo.layout.cell
          y: modelData.y * logo.layout.cell
          width: logo.layout.cell
          height: logo.layout.cell
          color: fill.logoColor
        }
      }
    }

    Image {
      width: logo.layout.width
      height: logo.layout.width / logo.aspect
      source: logo.visible
        ? "data:image/svg+xml;base64," + Qt.btoa(Model.recolorSvg(logo.svg, Model.hexColor(fill.logoColor.r, fill.logoColor.g, fill.logoColor.b)))
        : ""
      sourceSize.width: Math.ceil(width)
      sourceSize.height: Math.ceil(height)
      fillMode: Image.PreserveAspectFit
      smooth: true
    }
  }

  // A clock in big blocky digits, always upright: one line on a wide
  // strip, hours over minutes on a tall one, and the date under or beside
  // it where there is room. It ticks on the minute and moves a few pixels every few
  // minutes, against burn-in.
  Item {
    id: clock
    readonly property var layout: Model.clockLayout(Model.clockText(fill.now, fill.clockHours), fill.width, fill.height, fill.clockDate)
    readonly property real cell: layout.cell
    visible: fill.mode === "clock" && cell >= 1
    width: layout.spanColumns * cell
    height: layout.spanRows * cell
    // A twelfth of a block per step: enough to spread the wear, too little
    // to look off-center.
    x: Math.round((fill.width - width) / 2 + fill.shift.x * cell / 12)
    y: Math.round((fill.height - height) / 2 + fill.shift.y * cell / 12)

    // One set of blocks, moved into place each minute rather than made
    // anew; those the time does not need stay hidden.
    Repeater {
      model: clock.visible ? Model.CLOCK_CELLS : 0
      Rectangle {
        required property int index
        readonly property var cell: clock.layout.cells[index]
        visible: cell !== undefined
        x: visible ? cell.x * clock.cell : 0
        y: visible ? cell.y * clock.cell : 0
        width: clock.cell
        height: clock.cell
        color: fill.clockColor
      }
    }

    // In the font rather than in blocks: the glyphs have no letters. It
    // fills its box under or beside the time, and shrinks to its width.
    Text {
      textFormat: Text.PlainText
      readonly property var box: clock.layout.dateBox || ({ x: 0, y: 0, width: 0, height: 0 })
      visible: clock.layout.date !== ""
      x: box.x * clock.cell
      y: Math.round(box.y * clock.cell)
      width: box.width * clock.cell
      height: box.height * clock.cell
      horizontalAlignment: clock.layout.date === "beside" ? Text.AlignLeft : Text.AlignHCenter
      verticalAlignment: Text.AlignVCenter
      text: visible ? Qt.formatDate(fill.now, "ddd d MMM") : ""
      color: fill.clockColor
      font.family: Style.font.family
      font.bold: true
      font.pixelSize: Math.max(1, Math.round(height * 0.8))
      fontSizeMode: Text.HorizontalFit
      minimumPixelSize: 6
    }
  }

  Loader {
    anchors.fill: parent
    // Not before the strip has a size: there is nothing to lay out.
    active: fill.mode === "stats" && fill.width > 0 && fill.height > 0
    sourceComponent: Component {
      Reserve.StatsFill {
        panels: fill.panels
        pixelRatio: fill.pixelRatio
        shift: fill.shift
      }
    }
  }

  // A new interval restarts it, so every tick re-aims at the next minute,
  // or for the logo and the stats alone at their next move.
  Timer {
    running: clock.visible || logo.visible || fill.mode === "stats"
    repeat: true
    interval: (clock.visible ? Model.untilNextMinute(fill.now) : Model.untilNextShift(fill.now)) + 50
    onTriggered: fill.now = new Date()
    // Deferred: the clock's `visible` reads its layout, which reads `now`.
    onRunningChanged: if (running) Qt.callLater(function() { fill.now = new Date() })
  }
}
