import QtQuick
import "." as Reserve

// Now playing: the cover beside the title, artist, album and a progress
// bar with the time.
Item {
  id: media
  // The StatsCard it fills, for its view, theme and size.
  required property Item statsCard
  readonly property var track: media.statsCard.shown.media || null
  visible: track !== null && media.statsCard.shown.empty === ""
  anchors.fill: parent
  anchors.margins: media.statsCard.unit
  anchors.topMargin: Math.round(media.statsCard.unit * 1.6)

  Rectangle {
    id: cover
    width: Math.min(parent.height, parent.width * 0.4)
    height: width
    anchors.verticalCenter: parent.verticalCenter
    radius: Math.round(media.statsCard.unit * 0.4)
    color: media.statsCard.theme.meter
    // Only beside room for the title: a narrow card is all text.
    visible: width >= media.statsCard.unit * 3 && parent.width - width - media.statsCard.unit >= media.statsCard.unit * 14
    Text {
      textFormat: Text.PlainText
      anchors.centerIn: parent
      visible: art.status !== Image.Ready
      text: media.statsCard.shown.icon
      color: media.statsCard.shown.color
      font.family: media.statsCard.fontFamily
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
    anchors.leftMargin: cover.visible ? media.statsCard.unit : 0
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    spacing: Math.round(media.statsCard.unit * 0.35)
    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: media.track ? media.track.title : ""
      elide: Text.ElideRight
      color: media.statsCard.theme.foreground
      font.family: media.statsCard.fontFamily
      font.pixelSize: Math.round(media.statsCard.unit * 1.3)
      font.bold: true
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: text !== ""
      text: media.track ? media.track.artist : ""
      elide: Text.ElideRight
      color: media.statsCard.shown.color
      font.family: media.statsCard.fontFamily
      font.pixelSize: media.statsCard.unit
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: text !== ""
      text: media.track ? media.track.album : ""
      elide: Text.ElideRight
      color: media.statsCard.theme.subtle
      font.family: media.statsCard.fontFamily
      font.pixelSize: Math.round(media.statsCard.unit * 0.85)
    }
    Item { width: 1; height: Math.round(media.statsCard.unit * 0.3) }
    Reserve.StatsRow {
      statsCard: media.statsCard
      width: parent.width
      // A player that gives no length shows no time.
      visible: media.track !== null && (media.track.time !== "" || media.track.progress !== null)
      label: media.track && media.track.playing ? "\u{f040a}" : "\u{f03e4}"
      labelWidth: media.statsCard.unit * 1.6
      text: media.track ? media.track.time : ""
      fraction: media.track ? media.track.progress : null
      barColor: media.statsCard.shown.color
    }
  }
}
