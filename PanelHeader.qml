import QtQuick
import qs.Ui
import qs.Commons
import qs.Commons as Commons
import "." as Reserve
import "Model.js" as Model

// The top of the panel, above the page: the hero with the monitor's
// profile, summary and pause switch, a button per monitor when there are
// several, the preview and the page tabs.
Column {
  id: header
  // The Panel this header shows: its monitor, edges and edit functions.
  required property var panel
  spacing: Style.spacing.lg

  PanelHero {
    width: parent.width
    title: "OmaReach"
    meta: (header.panel.reserve.currentProfile ? header.panel.reserve.currentProfile + "  ·  " : "") + Model.shortSummary(header.panel.edge)
    foreground: header.panel.foreground
    fontFamily: header.panel.fontFamily
    iconComponent: Component {
      Reserve.ReserveIcon {
        iconSize: Style.font.display * 1.25
        color: header.panel.reserve.isActive(header.panel.output) ? Commons.Color.accent : header.panel.foreground
        reserved: header.panel.reserved
        paused: header.panel.reserved && !header.panel.edge.enabled
      }
    }
    // The switch says what it does: it pauses the reservation.
    trailingControl: Component {
      Row {
        spacing: Style.spacing.sm
        opacity: header.panel.reserved ? 1 : 0.4
        Text {
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
          text: !header.panel.reserved ? "Nothing reserved" : header.panel.edge.enabled ? "On" : "Paused"
          color: header.panel.subtle
          font.family: header.panel.fontFamily
          font.pixelSize: Style.font.caption
        }
        ToggleSwitch {
          anchors.verticalCenter: parent.verticalCenter
          checked: header.panel.reserve.isActive(header.panel.output)
          interactive: header.panel.reserved
          foreground: header.panel.foreground
          onToggled: { header.panel.toggleEnabled(header.panel.output); header.panel.refocus() }
        }
      }
    }
  }

  // Equal-width monitor buttons. Every button carries an icon so they
  // share one height; as on the bar, a crossed-out monitor is paused.
  Row {
    id: monitorRow
    visible: header.panel.screenNames.length > 1
    width: parent.width
    spacing: Style.spacing.md
    Repeater {
      model: header.panel.screenNames
      Button {
        required property string modelData
        width: (monitorRow.width - monitorRow.spacing * (header.panel.screenNames.length - 1)) / header.panel.screenNames.length
        text: modelData
        iconText: header.panel.reserve.isReserved(modelData) && !header.panel.reserve.edges(modelData).enabled ? "󰶐" : "󰍹"
        tooltipText: modelData + "  ·  " + Model.summary(header.panel.reserve.edges(modelData))
        selected: modelData === header.panel.output
        bordered: true
        foreground: header.panel.foreground
        fontFamily: header.panel.fontFamily
        onClicked: { header.panel.pickedOutput = modelData; header.panel.refocus() }
      }
    }
  }

  Reserve.PanelPreview {
    panel: header.panel
    width: parent.width
    height: Style.space(200)
  }

  // One page at a time below the preview, which stays in view on
  // every page so each edit shows where it lands.
  Row {
    id: pageRow
    width: parent.width
    spacing: Style.spacing.md
    Repeater {
      model: Model.PAGES
      Button {
        required property string modelData
        width: (pageRow.width - pageRow.spacing * (Model.PAGES.length - 1)) / Model.PAGES.length
        text: Model.PAGE_NAMES[modelData]
        horizontalPadding: Style.spacing.sm
        tooltipText: Model.PAGE_NAMES[modelData] + "  ·  [ and ] switch pages"
        selected: header.panel.page === modelData
        foreground: header.panel.foreground
        fontFamily: header.panel.fontFamily
        onClicked: { header.panel.page = modelData; header.panel.refocus() }
      }
    }
  }
}
