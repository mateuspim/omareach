import QtQuick
import qs.Ui
import qs.Commons
import "Clock.js" as Clock

// Up to three other zones for the Clock panel, a button each (click to take
// it off), and the list to add one from. Part of the Stats page.
Row {
  id: zoneRow
  // The PanelStatsPage whose zones, cursor and panel these buttons follow.
  required property var stats
  // The height of the Sun button under the row, which the dropdown matches.
  property real rowHeight: 0
  spacing: Style.spacing.md
  readonly property int cells: stats.zones.length + (stats.canAddZone ? 1 : 0)
  readonly property real cellWidth: (width - spacing * (cells - 1)) / Math.max(1, cells)
  Repeater {
    model: zoneRow.stats.clockShown ? zoneRow.stats.zones : []
    Button {
      required property string modelData
      required property int index
      width: zoneRow.cellWidth
      text: Clock.zoneCity(modelData)
      iconText: "󰥔"
      horizontalPadding: Style.spacing.sm
      hasCursor: zoneRow.stats.cursorOn(zoneRow.stats.zonesAt + index)
      bordered: true
      foreground: zoneRow.stats.panel.foreground
      fontFamily: zoneRow.stats.panel.fontFamily
      tooltipText: modelData + "\nClick to take it off the Clock panel  ·  X"
      onClicked: { zoneRow.stats.removeZone(modelData); zoneRow.stats.panel.refocus() }
    }
  }
  SearchableDropdown {
    id: zoneDropdown
    visible: zoneRow.stats.canAddZone
    width: zoneRow.cellWidth
    showLabel: false
    rowHeight: Math.round(zoneRow.rowHeight)
    value: ""
    triggerLabel: "Add zone"
    placeholderText: "City or region..."
    options: zoneRow.stats.zoneTab.filter(function(z) { return zoneRow.stats.zones.indexOf(z.zone) === -1 })
      .map(function(z) { return { value: z.zone, label: z.city, description: z.zone } })
    hasCursor: zoneRow.stats.cursorOn(zoneRow.stats.sunAt - 1)
    foreground: zoneRow.stats.panel.foreground
    fontFamily: zoneRow.stats.panel.fontFamily
    onChanged: function(value) { zoneRow.stats.addZone(value) }
    onPopupOpenChanged: if (!popupOpen) zoneRow.stats.panel.refocus()
  }
  // Opens the list: Enter on the cursor's "Add zone" asks the page for it.
  function openList() { zoneDropdown.open() }
}
