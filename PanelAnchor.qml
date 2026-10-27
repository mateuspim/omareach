import QtQuick
import Quickshell

// Where the panel's card opens. KeyboardPanel assumes the bar touches the
// screen edge. A reservation on the bar's side pushes the bar inwards, so
// `gap` grows by `barSideReserve` and the card opens beside the bar, not
// inside the black cap. Reservations on the two edges beside the bar shift
// the bar along its length and can hide the card's ends, which this item
// corrects.
//
// KeyboardPanel centers the card on its anchor in bar coordinates and only
// keeps it `margin` from the screen edges. This invisible stand-in for the
// button is offset so that the card lands centered on the button's real
// screen position and clear of both side caps.
Item {
  id: popupAnchor
  // The Panel, its bar button and its KeyboardPanel.
  required property var panel
  required property Item barButton
  required property var popupCard

  // Placement follows the bar's own monitor, not the one picked in the panel,
  // and the applied reservation, which is where the bar really is. It holds
  // still during a drag, so the card cannot slide under the pointer.
  readonly property var barEdge: panel.fitted(panel.reserve.appliedEdges(panel.barOutput), panel.barWindow ? panel.barWindow.screen : null)
  readonly property int barSideReserve: barEdge[panel.barPosition] || 0

  TransformWatcher {
    id: barWatcher
    a: popupAnchor.panel.barWindow ? popupAnchor.panel.barWindow.contentItem : null
    b: popupAnchor.panel
  }
  readonly property point barPos: {
    barWatcher.transform  // reactive dependency, as in KeyboardPanel
    return panel.barWindow ? panel.mapToItem(panel.barWindow.contentItem, 0, 0) : Qt.point(0, 0)
  }

  width: barButton.width
  height: barButton.height
  readonly property real offset: {
    var horizontal = panel.barHorizontal
    var before = horizontal ? barEdge.left : barEdge.top
    var after = horizontal ? barEdge.right : barEdge.bottom
    var along = horizontal ? barPos.x : barPos.y
    var size = horizontal ? barButton.width : barButton.height
    var card = horizontal ? popupCard.contentWidth : popupCard.contentHeight
    var screen = panel.barWindow && panel.barWindow.screen
      ? (horizontal ? panel.barWindow.screen.width : panel.barWindow.screen.height) : 0
    if (!(screen > 0)) return 0
    var start = along + before + size / 2 - card / 2
    var wanted = Math.max(before + popupCard.margin, Math.min(start, screen - after - card - popupCard.margin))
    return wanted - (along + size / 2 - card / 2)
  }
  x: panel.barHorizontal ? offset : 0
  y: panel.barHorizontal ? 0 : offset

  // The bar as KeyboardPanel sees it. KeyboardPanel matches clicks against
  // bar buttons as if the bar started at the screen's top-left corner (or
  // its bottom or right edge for such bars). A reservation on the bar's side
  // pushes the bar inwards, and one on its leading edge (left of a
  // horizontal bar, top of a vertical one) shifts it along; either way a
  // click would press the wrong button, or one from inside the cap. Hide
  // the buttons from it then: a click on the bar just closes the card.
  readonly property bool barShifted: barSideReserve > 0 || (panel.barHorizontal ? barEdge.left : barEdge.top) > 0
  readonly property QtObject popupBar: QtObject {
    readonly property string position: popupAnchor.panel.barPosition
    readonly property int barSize: popupAnchor.panel.bar ? popupAnchor.panel.bar.barSize : 0
    readonly property var activePopout: popupAnchor.panel.bar ? popupAnchor.panel.bar.activePopout : null
    readonly property var clickTargets: popupAnchor.barShifted || !popupAnchor.panel.bar ? [] : popupAnchor.panel.bar.clickTargets
    function requestPopout(owner) { if (popupAnchor.panel.bar) popupAnchor.panel.bar.requestPopout(owner) }
    function releasePopout(owner) { if (popupAnchor.panel.bar) popupAnchor.panel.bar.releasePopout(owner) }
    function targetBelongsToWindow(target, window) { return popupAnchor.panel.bar ? popupAnchor.panel.bar.targetBelongsToWindow(target, window) : false }
  }
}
