import QtQuick

// What a key just did, for a few seconds in the panel's footer: a key acts
// on things away from the cursor (F, I, a profile), and nothing else said
// what happened or that U takes it back.
QtObject {
  id: toast
  property string text: ""
  function say(message) {
    text = message
    timer.restart()
  }
  function clear() { text = ""; timer.stop() }
  property Timer timer: Timer {
    interval: 3000
    onTriggered: toast.text = ""
  }
}
