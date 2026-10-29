import QtQuick
import qs.Commons
import "." as Reserve
import "StatsTiles.js" as Tiles
import "StatsViews.js" as Views

// The stats fill: the monitor's chosen panels tiled over the strip as
// btop-style cards (Tiles.fit), with live numbers from the shared
// sampler. It is laid out at the strip's real size and scaled by
// `pixelRatio`, so the panel's small preview shows the same layout. The
// whole board moves with the burn-in `shift`, a third of a unit per step.
Item {
  id: root
  property var panels: []
  property real pixelRatio: 1
  property var shift: ({ x: 0, y: 0 })
  // The monitor's clock hours, 24 or 12, for the Clock card.
  property int clockHours: 24
  // In the panel's preview on the Stats page: each card shows its place
  // in `panels`, as that page numbers them, and `cardPicked` stands out.
  property bool cardKeys: false
  property string cardPicked: ""
  readonly property var sampler: Reserve.ReserveState.stats
  readonly property real boardWidth: width / pixelRatio
  readonly property real boardHeight: height / pixelRatio
  // Panels with nothing to show on this machine (an iGPU panel without a
  // second GPU) take no card. A string, so the grid is laid out again only
  // when that set changes, not on every sample.
  readonly property string availableKey: Views.availablePanels(panels, sampler.data).join(",")
  readonly property var grid: Tiles.fit(availableKey ? availableKey.split(",") : [], boardWidth, boardHeight)
  // The panels that made it onto the strip, so a card can leave out what
  // another one already shows.
  readonly property var laidOut: grid.cards.map(function(card) { return card.panel })
  readonly property int unit: grid.unit
  // The Clock card's state, apart from the samples: only it reads the
  // clock that ticks every second, so the other cards keep to stats.sh's
  // pace.
  readonly property var clockState: ({ time: sampler.data.time, clock: sampler.clockData, clockHours: root.clockHours })

  Item {
    width: root.boardWidth
    height: root.boardHeight
    scale: root.pixelRatio
    transformOrigin: Item.TopLeft
    x: Math.round(root.shift.x * root.unit / 3) * root.pixelRatio
    y: Math.round(root.shift.y * root.unit / 3) * root.pixelRatio

    Repeater {
      model: root.grid.cards
      Reserve.StatsCard {
        required property var modelData
        x: Math.round(modelData.x)
        y: Math.round(modelData.y)
        width: Math.round(modelData.width)
        height: Math.round(modelData.height)
        unit: root.unit
        panel: modelData.panel
        theme: root.sampler.palette
        badge: root.cardKeys ? root.panels.indexOf(modelData.panel) + 1 : 0
        picked: root.cardKeys && modelData.panel === root.cardPicked
        // Rows that fit under the title, a row and its gap each, for
        // panels whose lists grow to fill the card.
        readonly property int room: Math.floor((height - Math.round(root.unit * 1.6) - root.unit)
          / (Math.round(root.unit * 1.25) + Math.round(root.unit * 0.35)))
        view: Views.view(modelData.panel, modelData.panel === "clock" ? root.clockState : root.sampler.data, root.sampler.palette, room, Tiles.wideCard(modelData.panel, width, height, root.unit), Math.floor(width / root.unit), root.laidOut)
      }
    }
  }
}
