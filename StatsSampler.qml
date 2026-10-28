import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Mpris
import Quickshell.Services.UPower
import qs.Commons
import qs.Commons as Commons
import "Model.js" as Model
import "Stats.js" as Stats
import "Clock.js" as Clock

// The stats fill's data: runs stats.sh (and nvidia-smi for the GPU) while
// `running` and keeps what they print in `data` (Stats.ingest), with the
// theme's colors in `palette`. One instance, in ReserveState, serves every
// monitor and panel preview.
QtObject {
  id: root

  property bool running: false
  // Whether a panel on screen lists processes, which costs a pass over
  // /proc, and whether one reads nvidia-smi.
  property bool processes: false
  property bool gpu: false
  // Whether a panel shows the track playing, from the MPRIS players.
  property bool media: false
  // Whether a panel shows batteries, which adds UPower's peripherals.
  property bool batteries: false
  property var data: Stats.empty()
  // Whether a panel shows the Clock, which ticks every second and reads
  // the other `zones` and Omarchy's reminders; `location` is where the
  // sun is worked out, or null.
  property bool clock: false
  property var zones: []
  property var location: null

  // The clock the graphs and meters move by (StatsGraph, StatsEase), in
  // milliseconds: it ticks `pace` times a second (Model.statsPace), or on
  // every frame the monitors draw at 0. At 1 nothing moves between samples,
  // and the clock stands still.
  property int pace: Model.STATS_PACE
  readonly property bool animated: pace !== 1
  property real now: Date.now()
  property FrameAnimation frameClock: FrameAnimation {
    running: root.running && root.pace === 0
    onTriggered: root.now = Date.now()
  }
  property Timer paceClock: Timer {
    interval: Math.max(1, Math.round(1000 / Math.max(1, root.pace)))
    repeat: true
    running: root.running && root.pace > 1
    onTriggered: root.now = Date.now()
  }

  // How to read the NVIDIA GPU (Stats.nvidiaPoll): nvidia-smi's loop, a
  // single reading every `checkEvery` ms while it rests, or nothing while
  // it sleeps. stats.sh leaves nvidia-smi out unless the loop runs.
  readonly property string nvidiaMode: Stats.nvidiaPoll(data)
  readonly property int checkEvery: 10000
  onNvidiaModeChanged: if (sampler.running) { restarting = true; restartTimer.restart() }

  // Seconds between frames, and frames between process lists.
  readonly property real interval: 1
  readonly property int processEvery: 3
  readonly property string script: decodeURIComponent(String(Qt.resolvedUrl("stats.sh")).replace(/^file:\/\//, ""))

  // A process that stops while still wanted is started again after a
  // pause; bumping the epoch re-evaluates its `running` binding.
  property int samplerEpoch: 0
  property int gpuEpoch: 0
  // Restarting stats.sh for a new argument: off for a moment, then on.
  property bool restarting: false
  onProcessesChanged: if (sampler.running) { restarting = true; restartTimer.restart() }
  // Whether stats.sh asks `ip` for the tunnels' addresses (ReserveState's
  // statsTunnelAddress); it reads the environment once, so a change
  // restarts it.
  property bool tunnelAddress: false
  onTunnelAddressChanged: if (sampler.running) { restarting = true; restartTimer.restart() }

  property Process sampler: Process {
    command: ["bash", root.script, String(root.interval), root.processes ? String(root.processEvery) : "0"]
    environment: ({ STATS_NVIDIA: root.nvidiaMode === "on" ? "1" : "0", STATS_TUNNEL_ADDRESS: root.tunnelAddress ? "1" : "0" })
    running: root.running && !root.restarting && root.samplerEpoch >= 0
    stdout: SplitParser {
      splitMarker: "@end\n"
      onRead: function(frame) {
        root.data = Stats.withTunnelInfo(Stats.step(root.data, frame, root.gpuLines, root.media ? root.track() : null, root.batteries ? Stats.upowerBatteries(root.peripherals()) : null), root.tunnelInfo)
        root.gpuLines = []
      }
    }
    onExited: if (root.running && !root.restarting) samplerRetry.restart()
  }

  // Where the VPNs and meshes that are up go (vpn.sh, Stats.parseVpnInfo),
  // laid over every frame. The kernel only says a tunnel is up, so each
  // client is asked: every 10 s while one is up, and as soon as the set
  // changes; never while none is.
  readonly property string vpnScript: decodeURIComponent(String(Qt.resolvedUrl("vpn.sh")).replace(/^file:\/\//, ""))
  readonly property string tunnelKey: Stats.tunnelClients(data.network).join(" ")
  property var tunnelInfo: null
  // The tunnels the run in flight was started for: one that ends after
  // they changed answered for the old set, so its answer is dropped and
  // it runs again for the new one.
  property string vpnAskedFor: ""
  onTunnelKeyChanged: {
    tunnelInfo = null
    if (tunnelKey && running) vpnTimer.restart()
  }
  function askVpn() {
    if (vpnProcess.running) return
    vpnAskedFor = tunnelKey
    vpnProcess.command = ["bash", vpnScript].concat(tunnelKey.split(" "))
    vpnProcess.running = true
  }
  property Process vpnProcess: Process {
    stdout: StdioCollector {
      onStreamFinished: if (root.vpnAskedFor === root.tunnelKey) root.tunnelInfo = root.tunnelKey ? Stats.parseVpnInfo(text) : null
    }
    onExited: if (root.vpnAskedFor !== root.tunnelKey && root.tunnelKey && root.running) Qt.callLater(root.askVpn)
  }
  property Timer vpnTimer: Timer {
    interval: 10000
    repeat: true
    triggeredOnStart: true
    running: root.running && root.tunnelKey !== ""
    onTriggered: root.askVpn()
  }

  // Found once, the first time a panel needs it: whether there is an
  // nvidia-smi to run at all.
  property bool hasNvidia: false
  property bool nvidiaChecked: false
  property Process nvidiaCheck: Process {
    command: ["bash", "-c", "type -P nvidia-smi"]
    running: root.running && root.gpu && !root.nvidiaChecked
    onExited: function(code) {
      root.nvidiaChecked = true
      root.hasNvidia = code === 0
      if (!root.hasNvidia) root.data = Object.assign({}, root.data, { nvidiaMissing: true })
    }
  }

  // nvidia-smi's own loop: one process, a line per second, instead of a
  // new process each time. Its line waits for the next stats.sh frame, so
  // the dashboard changes once a second, all at once.
  // nvidia-smi prints a line per GPU each time; all of them wait.
  property var gpuLines: []
  // Runs of nvidia-smi that ended without printing a line: it is there but
  // cannot reach the driver. After a few, the GPU counts as missing.
  property int gpuFailures: 0
  property bool gpuPrinted: false
  readonly property var gpuQuery: ["nvidia-smi",
    "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,clocks.gr,fan.speed,utilization.encoder,utilization.decoder",
    "--format=csv,noheader,nounits"]
  property Process gpuProcess: Process {
    command: root.gpuQuery.concat(["-lms", String(Math.round(root.interval * 1000))])
    running: root.running && root.gpu && root.hasNvidia && root.nvidiaMode === "on" && root.gpuEpoch >= 0
    stdout: SplitParser {
      onRead: function(line) {
        root.gpuLines = root.gpuLines.concat([line])
        root.gpuPrinted = true
        root.gpuFailures = 0
      }
    }
    onRunningChanged: if (running) root.gpuPrinted = false
    onExited: {
      // Stopped on purpose, for the GPU to rest.
      if (root.nvidiaMode !== "on") return
      if (!root.gpuPrinted && ++root.gpuFailures >= 3) {
        root.hasNvidia = false
        root.data = Object.assign({}, root.data, { nvidiaMissing: true })
        return
      }
      if (root.running && root.gpu) gpuRetry.restart()
    }
  }

  // UPower's devices for Stats.upowerBatteries: it knows Bluetooth
  // headsets, which the kernel does not list. Read once a frame.
  // An index loop: the list is array-like, and map on it gives no array.
  function peripherals() {
    var list = UPower.devices.values
    var result = []
    for (var i = 0; i < list.length; i++) {
      var device = list[i]
      result.push({
        nativePath: device.nativePath, model: device.model, type: UPowerDeviceType.toString(device.type),
        powerSupply: device.powerSupply, percentage: device.percentage, state: UPowerDeviceState.toString(device.state)
      })
    }
    return result
  }

  // A resting GPU's single reading, now and then: one that finds it busy
  // brings the loop back (Stats.nvidiaPoll).
  property Process gpuCheck: Process {
    command: root.gpuQuery
    stdout: SplitParser {
      onRead: function(line) { root.gpuLines = root.gpuLines.concat([line]) }
    }
  }
  property Timer gpuCheckTimer: Timer {
    interval: root.checkEvery
    repeat: true
    running: root.running && root.gpu && root.hasNvidia && root.nvidiaMode === "check"
    onTriggered: if (!root.gpuCheck.running) root.gpuCheck.running = true
  }

  // The track of the player Stats.pickPlayer picks; null without players.
  // Read once a frame, so its position moves on.
  function track() {
    var player = Stats.pickPlayer(Mpris.players.values)
    if (!player) return null
    return {
      identity: player.identity, title: player.trackTitle, artist: player.trackArtist, album: player.trackAlbum,
      art: player.trackArtUrl, playing: player.isPlaying,
      position: player.positionSupported ? player.position : null,
      length: player.lengthSupported ? player.length : null
    }
  }

  // The Clock card's data (Clock.clockFacts), apart from `data`: it moves
  // on the second, the samples whenever stats.sh prints, and only the
  // Clock card reads it. `now` ticks on the second, a little after, so a
  // tick never lands just before the second it should show.
  readonly property bool clockRunning: running && clock
  property real clockNow: Date.now()
  readonly property var clockData: ({
    now: clockNow, dateText: Qt.formatDate(new Date(clockNow), "ddd d MMM"),
    zones: zones, offsets: zoneOffsets.offsets, local: zoneOffsets.local, reminders: reminders, location: location
  })
  property Timer clockTimer: Timer {
    running: root.clockRunning
    repeat: true
    interval: 1000 - root.clockNow % 1000 + 20
    onTriggered: root.clockNow = Date.now()
    onRunningChanged: if (running) root.clockNow = Date.now()
  }

  // The zones' UTC offsets and this machine's zone (zones.sh): QML's
  // JavaScript has no time zones of its own. Read again every 5 minutes,
  // for a daylight saving change, and as soon as the zones change. The
  // panel reads `localZone` for its sunrise button, so it runs without
  // other zones too.
  readonly property string zonesScript: decodeURIComponent(String(Qt.resolvedUrl("zones.sh")).replace(/^file:\/\//, ""))
  property var zoneOffsets: ({ local: "", offsets: {} })
  readonly property string localZone: zoneOffsets.local
  onZonesChanged: if (clockRunning) Qt.callLater(askZones)
  function askZones() {
    if (zonesProcess.running) return
    zonesProcess.command = ["bash", zonesScript].concat(zones)
    zonesProcess.running = true
  }
  property Process zonesProcess: Process {
    stdout: StdioCollector {
      onStreamFinished: root.zoneOffsets = Clock.parseZoneOffsets(text)
    }
  }
  property Timer zonesTimer: Timer {
    interval: 300000
    repeat: true
    triggeredOnStart: true
    running: root.clockRunning
    onTriggered: root.askZones()
  }

  // Omarchy's reminders, as its bar indicator reads them: every 30 s, and
  // the countdown runs on the clock in between. Without omarchy-reminder,
  // or when it fails, there are none.
  property var reminders: []
  property Process remindersProcess: Process {
    command: ["omarchy-reminder", "show", "--json"]
    stdout: StdioCollector {
      onStreamFinished: root.reminders = Clock.parseReminders(text)
    }
    onExited: function(code) { if (code !== 0) root.reminders = [] }
  }
  property Timer remindersTimer: Timer {
    interval: 30000
    repeat: true
    triggeredOnStart: true
    running: root.clockRunning
    onTriggered: if (!root.remindersProcess.running) root.remindersProcess.running = true
  }

  property Timer restartTimer: Timer {
    interval: 200
    onTriggered: root.restarting = false
  }
  property Timer samplerRetry: Timer {
    interval: 5000
    onTriggered: root.samplerEpoch++
  }
  property Timer gpuRetry: Timer {
    interval: 5000
    onTriggered: root.gpuEpoch++
  }

  // The theme's named colors. The shell reads colors.toml only at startup
  // and takes theme switches over IPC into Color, which keeps just five
  // of them; so the file is read again whenever those change, by when
  // Omarchy has put the new theme in place.
  property var colors: ({})
  readonly property string themeColors: String(Commons.Color.foreground) + String(Commons.Color.background) + String(Commons.Color.accent) + String(Commons.Color.urgent) + String(Commons.Color.muted)
  onThemeColorsChanged: themeFile.reload()
  readonly property var palette: Stats.palette(colors, {
    foreground: hex(Commons.Color.foreground), background: hex(Commons.Color.background),
    accent: hex(Commons.Color.accent), urgent: hex(Commons.Color.urgent), muted: hex(Commons.Color.muted)
  })
  function hex(color) { return Model.hexColor(color.r, color.g, color.b) }

  property FileView themeFile: FileView {
    path: Commons.Color.currentThemePath + "/colors.toml"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.colors = Stats.parseColors(text())
    onLoadFailed: root.colors = ({})
  }
}
