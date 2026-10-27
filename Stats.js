.pragma library
.import "StatsGpu.js" as Gpu
.import "StatsNet.js" as Net
.import "StatsProc.js" as Proc
.import "StatsSystem.js" as Sys

// The stats fill's state, without any QML: frames from stats.sh and
// nvidia-smi turned into rates and histories. The parsers live beside it
// (StatsProc.js, StatsNet.js, StatsSystem.js, StatsGpu.js), the theme and
// text forms in StatsFormat.js; StatsViews.js draws the panels from it.

// Samples kept for each graph.
var HISTORY = 60

// Seconds between two frames past which their counters no longer make a
// rate: the sampler was paused, or the session slept.
var GAP = 10

// Seconds between two process samples past which the same holds.
var PROCESS_GAP = 30

// The paced animations' curve: slow at both ends, like Easing.InOutQuad,
// for `t` from 0 to 1.
function ease(t) {
  t = Math.max(0, Math.min(1, t))
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
}

// How far, from 0 to 1, an animation that began at `start` and lasts
// `duration` has come at `now`, all in milliseconds.
function progress(now, start, duration) {
  if (!(duration > 0)) return 1
  return Math.max(0, Math.min(1, (now - start) / duration))
}

function pushHistory(series, value, length) {
  var next = series.concat([value])
  var keep = length || HISTORY
  return next.length > keep ? next.slice(next.length - keep) : next
}

function empty() {
  return {
    time: null,
    counters: null,
    cpu: { total: null, cores: [], coreIds: [], threads: 0, temp: null, tempLimit: null, frequency: null, power: null, powerLimit: null, loadavg: [] },
    memory: null,
    network: { interface: "", rx: null, tx: null, rxTotal: 0, txTotal: 0, vpn: [], mesh: [], vpnSeen: false },
    disks: [],
    pressure: null,
    fans: [],
    processes: [],
    // The programs holding the most memory, from the same samples.
    memoryProcesses: [],
    processSample: null,
    // The NVIDIA GPU from nvidia-smi, and AMD and Intel GPUs from sysfs
    // (drmGpus); gpuRoles picks which panel shows which. `gpuKey` is the
    // main GPU whose history `history.gpu` holds.
    nvidia: null,
    nvidiaMissing: false,
    nvidiaAge: 0,
    // What sysfs tells of the NVIDIA cards without waking them: whether
    // one can power itself down (`managed`, runtime power management on,
    // as on a laptop) and whether one is asleep; the frames in a row its
    // readings showed it idle; and its name, for while it sleeps.
    nvidiaPower: { managed: false, asleep: false },
    nvidiaIdle: 0,
    nvidiaName: "",
    // Each AMD or Intel card's kind as last seen awake: asleep, a card
    // reports no VRAM to tell.
    drmKinds: {},
    igpuKey: "",
    drm: [],
    gpuKey: "",
    gpuApps: [],
    temps: [],
    nvmeTemps: {},
    nvmeLimits: {},
    // stats.sh's @slowhwmon lines, which come every few frames only.
    slowHwmon: [],
    system: null,
    // stats.sh's @sysinfo (parseSysinfo), which comes every minute only.
    sysinfo: null,
    threads: null,
    power: [],
    // The track playing, from the shell's MPRIS players; see step.
    media: null,
    history: { cpu: [], gpu: [], igpu: [], rx: [], tx: [], disk: [] }
  }
}

function rate(before, after, seconds) {
  if (before === undefined || before === null || !(seconds > 0)) return null
  var value = (after - before) / seconds
  // A counter that went backwards was reset.
  return value >= 0 ? value : null
}

// The busiest interface when there is no default route.
function busiestInterface(net) {
  var best = "", most = -1
  for (var name in net) {
    if (name === "lo") continue
    if (net[name].rx + net[name].tx > most) { best = name; most = net[name].rx + net[name].tx }
  }
  return best
}

// `state` updated with one parsed stats.sh frame. Rates need the frame
// before, so the first frame (and the first after a gap) has none.
function ingest(state, frame) {
  state = state || empty()
  var next = Object.assign({}, state)
  var history = Object.assign({}, state.history)
  var seconds = state.time === null ? 0 : frame.time - state.time
  var fresh = state.counters !== null && seconds > 0 && seconds <= GAP
  var before = fresh ? state.counters : null
  var cards = Gpu.parseDrm(frame.drm || [])
  // NVIDIA's cards only say whether they sleep; nvidia-smi reads them.
  var nvidiaPower = { managed: false, asleep: false }
  for (var id in cards) {
    if (cards[id].driver !== "nvidia") continue
    if (cards[id].control === "auto") nvidiaPower.managed = true
    if (cards[id].status === "suspended") nvidiaPower.asleep = true
    delete cards[id]
  }
  next.nvidiaPower = nvidiaPower
  var counters = {
    cpu: Proc.parseCpu(frame.stat || []),
    net: Net.parseNetDev(frame.net || []),
    disk: Proc.parseDiskstats(frame.disk || []),
    rapl: Sys.parseRapl(frame.rapl || []),
    drmIdle: {}
  }
  for (var card in cards) if (cards[card].idle_ms !== undefined) counters.drmIdle[card] = cards[card].idle_ms
  // Sensors stats.sh reads every few frames only (a Dell's fans, through
  // firmware) keep their last lines between reads.
  var slow = frame.slowhwmon || state.slowHwmon || []
  next.slowHwmon = slow
  var sensors = Sys.parseSensors((frame.hwmon || []).concat(slow), frame.nvme || [])
  // stats.sh reads NVMe temperatures every few frames only; between them
  // the last ones stand.
  if (!frame.nvme) { sensors.nvme = state.nvmeTemps || {}; sensors.nvmeLimits = state.nvmeLimits || {} }

  var load = before ? Proc.cpuLoad(before.cpu, counters.cpu) : null
  next.cpu = {
    total: load ? load.total : null,
    cores: load ? load.cores : [],
    // Each core's CPU number, for coreGroups: cpu7 is 7.
    coreIds: load ? counters.cpu.cores.map(function(core) { return Number(core.id.slice(3)) }) : [],
    threads: counters.cpu.cores.length,
    temp: sensors.cpuTemp,
    tempLimit: sensors.cpuLimit,
    frequency: Sys.averageFrequency(frame.freq || []),
    power: before ? Sys.raplWatts(before.rapl, counters.rapl, seconds) : null,
    powerLimit: counters.rapl ? counters.rapl.limit : null,
    loadavg: (frame.loadavg && frame.loadavg[0] ? frame.loadavg[0].split(" ").slice(0, 3).map(Number) : [])
  }
  if (load) history.cpu = pushHistory(history.cpu, load.total)

  next.memory = Proc.parseMeminfo(frame.meminfo || [])

  var name = Net.defaultInterface(frame.route || []) || busiestInterface(counters.net)
  var now = counters.net[name]
  var was = before && before.net[name]
  var tunnels = Net.parseTunnels(frame.tunnel || [], Net.defaultInterface(frame.route || []))
  next.network = {
    vpn: tunnels.vpn,
    mesh: tunnels.mesh,
    // Once a VPN was on, the card says when it goes off, which is when it
    // matters; a machine that never runs one gets no row about it.
    vpnSeen: tunnels.vpn.length > 0 || state.network.vpnSeen === true,
    interface: now ? name : "",
    rx: now && was ? rate(was.rx, now.rx, seconds) : null,
    tx: now && was ? rate(was.tx, now.tx, seconds) : null,
    rxTotal: now ? now.rx : 0,
    txTotal: now ? now.tx : 0
  }
  if (next.network.rx !== null) history.rx = pushHistory(history.rx, next.network.rx)
  if (next.network.tx !== null) history.tx = pushHistory(history.tx, next.network.tx)

  var models = {}
  ;(frame.model || []).forEach(function(line) {
    var f = line.split("\t")
    models[f[0]] = (f[1] || "").trim()
  })
  var total = null
  next.disks = Object.keys(counters.disk).sort().map(function(disk) {
    var then = before && before.disk[disk]
    var controller = /^(nvme\d+)n/.exec(disk)
    var entry = {
      name: disk,
      model: models[disk] || "",
      read: then ? rate(then.read, counters.disk[disk].read, seconds) : null,
      write: then ? rate(then.written, counters.disk[disk].written, seconds) : null,
      temp: controller && sensors.nvme[controller[1]] !== undefined ? sensors.nvme[controller[1]] : null,
      tempLimit: controller && sensors.nvmeLimits[controller[1]] !== undefined ? sensors.nvmeLimits[controller[1]] : null
    }
    if (entry.read !== null || entry.write !== null) total = (total || 0) + (entry.read || 0) + (entry.write || 0)
    return entry
  })
  if (total !== null) history.disk = pushHistory(history.disk, total)

  next.pressure = Proc.parsePressure(frame.psi || [])

  next.fans = sensors.fans
  next.temps = sensors.temps
  next.nvmeTemps = sensors.nvme
  next.nvmeLimits = sensors.nvmeLimits
  next.system = frame.system ? Sys.parseSystem(frame.system) : null
  next.sysinfo = frame.sysinfo ? Sys.parseSysinfo(frame.sysinfo) : state.sysinfo
  var tasks = next.cpu.loadavg.length && frame.loadavg[0].split(" ")[3]
  next.threads = tasks ? Number(tasks.split("/")[1]) : null
  next.power = Sys.parsePower(frame.power || [])
  next.drmKinds = Object.assign({}, state.drmKinds)
  next.drm = Gpu.drmGpus(cards, before ? before.drmIdle : {}, seconds, next.drmKinds, state.drm, next.sysinfo)

  if (frame.procs) {
    var procs = Proc.parseProcs(frame.procs)
    var last = state.processSample
    var elapsed = last ? frame.time - last.time : 0
    if (last && elapsed > 0 && elapsed <= PROCESS_GAP) next.processes = Proc.topProcesses(last.procs, procs, elapsed, 10)
    next.memoryProcesses = Proc.topMemory(procs, Number((next.sysinfo || {}).page_size), 10)
    next.processSample = { time: frame.time, procs: procs }
  }
  if (frame.gpuapps) next.gpuApps = Gpu.parseGpuApps(frame.gpuapps)

  next.time = frame.time
  next.counters = counters
  next.history = history
  return next
}

// One update of the dashboard: a stats.sh frame (its text) with the
// latest nvidia-smi line since the frame before, or "" when none came, and
// `media`, the track playing ({ identity, title, artist, album, art,
// playing, position, length } or null), when the media panel is shown,
// and `batteries`, UPower's (upowerBatteries), when the battery panel is.
// Everything on screen changes at once, a sample a second, and the GPU's
// history advances with the frames like the others: a frame without a new
// line repeats the last reading.
function step(state, text, gpuLine, media, batteries) {
  var next = ingest(state, Proc.parseFrame(text))
  // UPower's peripherals, when the battery panel is shown, after the
  // kernel's (which come first for the same device, taking the kind of
  // device UPower knows it as).
  if (batteries) {
    var known = next.power.map(function(b) { return b.id })
    var power = next.power.map(function(kernel) {
      var same = batteries.filter(function(b) { return b.id === kernel.id && b.kind })[0]
      return same ? Object.assign({}, kernel, { kind: same.kind }) : kernel
    })
    for (var b = 0; b < batteries.length; b++) if (known.indexOf(batteries[b].id) === -1) power.push(batteries[b])
    next.power = power
  }
  var updated = Gpu.ingestGpu(next, gpuLine)
  if (updated !== next) {
    next = updated
    var reading = next.nvidia
    next.nvidiaName = reading.name
    next.nvidiaIdle = reading.load === 0 && !reading.encoder && !reading.decoder ? state.nvidiaIdle + 1 : 0
    next.nvidia = Object.assign({}, reading, { resting: false })
  } else if (next.nvidiaPower.asleep) {
    next.nvidiaIdle = 0
  } else if (next.nvidia && Gpu.nvidiaPoll(next) !== "on") {
    // Read only now and then, it keeps its last reading.
    if (!next.nvidia.resting) next.nvidia = Object.assign({}, next.nvidia, { resting: true })
    next.nvidiaAge = 0
  } else if (next.nvidia && ++next.nvidiaAge > Gpu.NVIDIA_STALE) { next.nvidia = null; next.nvidiaAge = 0 }
  if (media !== undefined) next.media = media
  var roles = Gpu.gpuRoles(next)
  var history = next.history
  var key = roles.main ? roles.main.id : ""
  // Another GPU taking over the panel starts its own history.
  if (key !== next.gpuKey) { history.gpu = []; next.gpuKey = key }
  if (roles.main && roles.main.load !== null) history.gpu = pushHistory(history.gpu, roles.main.load)
  var igpuKey = roles.integrated ? roles.integrated.id : ""
  if (igpuKey !== next.igpuKey) { history.igpu = []; next.igpuKey = igpuKey }
  if (roles.integrated && roles.integrated.load !== null) history.igpu = pushHistory(history.igpu, roles.integrated.load)
  return next
}
