import QtQuick
import qs.Ui
import qs.Commons
import "ModelProfiles.js" as Profiles

// The panel's Profiles page: named snapshots of every monitor. A chip
// applies one, and the one on screen is selected; the field below names
// one to save, and Auto ties it to the monitors connected now.
Column {
  id: page
  // The Panel this page edits: its profiles and their functions.
  required property var panel
  spacing: Style.spacing.sm

  // Puts the cursor in the name field, for the `s` key.
  function focusField() { profileField.forceActiveFocus() }

  // --- keyboard cursor (Panel.pageKey) ----------------------------------------
  // The chips as they wrap, then the name field, Auto and Save. The chips
  // keep their own widths, so their rows are read off where they landed.
  readonly property int fieldAt: panel.profileNames.length
  readonly property var chipRows: {
    var rows = [], lastY = null
    for (var i = 0; i < chips.count; i++) {
      var chip = chips.itemAt(i)
      if (!chip) continue
      if (chip.y !== lastY) { rows.push(0); lastY = chip.y }
      rows[rows.length - 1]++
    }
    return rows
  }
  readonly property var cursorRows: chipRows.concat([3])
  readonly property var cursorKeys: panel.profileNames.map(function(n) { return "profile:" + n }).concat(["field", "auto", "save"])
  readonly property int cursorHome: Math.max(0, panel.profileNames.indexOf(panel.reserve.currentProfile))
  function cursorOn(index) { return panel.page === "profiles" && panel.pageCursor === index }
  function activate(index, alt) {
    if (index < fieldAt) {
      if (alt) panel.deleteProfile(panel.profileNames[index])
      else panel.applyProfile(panel.profileNames[index])
    } else if (index === fieldAt) focusField()
    else if (index === fieldAt + 1) autoButton.toggle()
    else if (index === fieldAt + 2) saveProfileButton.save()
  }
  // Deleting can be undone, like a right click. Returns where the cursor
  // goes: the next profile, or the field once none is left.
  // What the last remove() did, for the panel's toast; "" for nothing.
  property string removed: ""
  function remove(index) {
    removed = ""
    if (index >= fieldAt) return index
    removed = "Deleted " + panel.profileNames[index]
    panel.deleteProfile(panel.profileNames[index])
    return Math.min(index, fieldAt)
  }

  PanelSectionHeader {
    text: "PROFILES"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  Text {
    visible: page.panel.profileNames.length === 0
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "No profiles yet. Name one below to save every monitor as it is now."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
  Flow {
    visible: page.panel.profileNames.length > 0
    width: parent.width
    spacing: Style.spacing.md
    Repeater {
      id: chips
      model: page.panel.profileNames
      Button {
        required property string modelData
        required property int index
        // Auto shows on the chip, not only in its tooltip.
        text: modelData + (page.panel.reserve.isAuto(modelData) ? "  ·  auto" : "")
        iconText: index < 9 ? String(index + 1) : ""
        tooltipText: "Apply " + modelData + " to every monitor" + (index < 9 ? "  ·  " + (index + 1) : "")
          + (page.panel.reserve.autoProfiles[modelData] ? "\nApplied by itself with " + page.panel.reserve.autoProfiles[modelData].join(", ") : "")
          + "\nRight click to delete"
        selected: page.panel.reserve.currentProfile === modelData
        hasCursor: page.cursorOn(index)
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        onClicked: { page.panel.applyProfile(modelData); page.panel.refocus() }
        onRightClicked: { page.panel.deleteProfile(modelData); page.panel.refocus() }
      }
    }
  }
  Item {
    width: parent.width
    height: Math.max(profileField.implicitHeight, saveProfileButton.implicitHeight)
    TextField {
      id: profileField
      anchors.left: parent.left
      anchors.right: autoButton.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      placeholderText: "Profile name"
      // The cursor shows on the field until Enter puts the caret in it.
      hasCursor: page.cursorOn(page.fieldAt)
      // The Panel owns the name, so applying a profile or reopening the
      // panel can set it.
      text: page.panel.profileDraft
      onTextChanged: page.panel.profileDraft = text
      foreground: page.panel.foreground
      font.family: page.panel.fontFamily
      maximumLength: 32
      onAccepted: { page.panel.saveProfile(text); page.panel.refocus() }
    }
    // Ties the named profile to the monitors connected now.
    Button {
      id: autoButton
      readonly property string existing: Profiles.findProfile(page.panel.reserve.profiles, profileField.text)
      anchors.right: saveProfileButton.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      text: "Auto"
      iconText: "󰁪"
      enabled: existing !== ""
      opacity: enabled ? 1 : 0.4
      selected: enabled && page.panel.reserve.isAuto(existing)
      hasCursor: page.cursorOn(page.fieldAt + 1)
      function toggle() { if (enabled) page.panel.reserve.setAuto(existing, !selected) }
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: !enabled ? "Name a saved profile to apply it by itself when these monitors connect"
        : selected ? existing + " applies by itself whenever exactly these monitors connect. Click to stop"
        : "Apply " + existing + " by itself whenever exactly these monitors connect: " + page.panel.screenNames.join(", ")
      onClicked: { toggle(); page.panel.refocus() }
    }
    Button {
      id: saveProfileButton
      readonly property string name: Profiles.profileName(profileField.text)
      readonly property string existing: Profiles.findProfile(page.panel.reserve.profiles, name)
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: existing ? "Update" : "Save"
      iconText: "󰆓"
      enabled: name !== ""
      opacity: enabled ? 1 : 0.4
      hasCursor: page.cursorOn(page.fieldAt + 2)
      function save() { if (enabled) page.panel.saveProfile(profileField.text) }
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: existing ? "Save every monitor as it is now over " + existing : "Save every monitor as it is now under this name"
      onClicked: { save(); page.panel.refocus() }
    }
  }
  // What the buttons above do, which their names alone don't say.
  Text {
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "A profile holds every monitor's edges and fill; 1 – 9 apply one. Auto applies it by itself whenever exactly these monitors connect. Right-click a profile, or X on it, to delete it; U undoes that."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
}
