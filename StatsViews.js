.pragma library
.import "StatsFormat.js" as Format
.import "StatsGpu.js" as Gpu
.import "StatsClockView.js" as ClockView
.import "StatsRows.js" as Rows
.import "StatsSystem.js" as Sys

// What each panel of the stats fill shows, without any QML: its title,
// icon and rows, from the state Stats.js keeps and the palette
// StatsFormat.js makes. StatsTiles.js tiles the panels over a strip,
// StatsRows.js builds the rows they share.

var ICONS = {
  gpu: "\u{f08ae}", igpu: "\u{f08ae}", temps: "\u{f050f}", battery: "\u{f0079}", media: "\u{f075a}", system: "\u{f02fd}", cpu: "\u{f061a}", memory: "\u{f035b}", network: "\u{f0200}",
  disks: "\u{f02ca}", processes: "\u{f0279}", clock: "\u{f0954}"
}
var TITLES = { gpu: "GPU", igpu: "iGPU", temps: "Sensors", battery: "Battery", media: "Now playing", system: "System", cpu: "CPU", memory: "Memory", network: "Network", disks: "Disks", processes: "Processes", clock: "Clock" }

// What one panel shows, ready to draw: a title with an icon and the box's
// color, an optional big value with a caption, graphs (each with an
// optional label), per-core bars (a `gap` entry splits them into groups),
// a stacked bar of `stack` parts, label/value rows with meters and ranked
// lists. `note` is a line under the headline, for what its caption has no
// room for. `captionTip`, `noteTip` and a row's `tip` say in full what
// they name, shown on hover. `alert` asks for the card's warning color, 0 for none to
// CRITICAL. `empty` replaces the
// content with a message. `room` is how many rows the card has space for,
// for panels whose lists can grow to fill it, `wide` whether its rows sit
// beside the headline rather than under it, `span` its width in units,
// and `shown` the other panels on the same dashboard, so a reading one of
// them carries is not repeated here.
function view(panel, state, palette, room, wide, span, shown) {
  var g = palette.gradients
  var result = {
    title: TITLES[panel] || panel, icon: ICONS[panel] || "", color: palette.boxes[panel] || palette.accent,
    info: "", value: "", valueColor: palette.foreground, caption: "", captionTip: "", note: "", noteTip: "",
    graphs: [], bars: [], stack: [], rows: [], lists: [], digits: "", empty: "", logo: false, alert: 0
  }
  var build = VIEWS[panel]
  if (build) build(result, state, palette, g, room, wide, span, shown || [])
  if (room !== undefined && wide) Rows.fitHeadline(result, room)
  if (room !== undefined) result.rows = result.rows.slice(0, Rows.rowsThatFit(result, room, wide))
  return result
}

// Whether `panel` has anything to show on this machine, once the sampler
// has reported: a dashboard leaves out an iGPU panel without a second GPU
// and a Battery panel without a battery rather than give them a card that
// only says so. Before the first frame every panel counts.
function available(panel, state) {
  if (!state || state.time === null) return true
  if (panel === "igpu") return Gpu.gpuRoles(state).integrated !== null
  if (panel === "battery") return state.power.length > 0
  return true
}

// The panels of `panels` that have something to show, in their order.
function availablePanels(panels, state) {
  return panels.filter(function(panel) { return available(panel, state) })
}

// The rows of a GPU panel for one GPU, whichever its vendor: load with
// its `history`, then every reading it has.
function gpuView(v, gpu, history, g, room, wide) {
  v.info = gpu.name
  if (gpu.asleep) { v.empty = "Asleep"; return }
  v.value = Format.formatPercent(gpu.load)
  v.valueColor = Format.gradientAt(g.cpu, (gpu.load || 0) / 100)
  v.caption = gpu.resting ? "idle" : "load"
  v.graphs.push({ values: history, max: 100, stops: g.cpu, label: "" })
  if (gpu.memUsed !== null && gpu.memTotal) {
    var vram = gpu.memUsed / gpu.memTotal
    v.rows.push(Rows.row("VRAM", Format.formatPair(gpu.memUsed, gpu.memTotal), vram, Format.gradientAt(g.level, vram)))
    if (vram >= Rows.ALERT_VRAM) Rows.raise(v, Rows.ALERT)
  }
  if (gpu.temp !== null) {
    v.rows.push(Rows.heatRow("Temp", gpu.temp, gpu.tempLimit, g))
    if (Rows.hot(gpu.temp, gpu.tempLimit)) Rows.raise(v, Rows.ALERT)
  }
  if (gpu.power !== null) {
    var limit = gpu.powerLimit
    v.rows.push(Rows.row("Power", limit ? Rows.watts(gpu.power) + " / " + Rows.watts(limit) + " W" : Rows.watts(gpu.power) + " W",
      limit ? gpu.power / limit : null, limit ? Format.gradientAt(g.level, gpu.power / limit) : ""))
  }
  if (gpu.clock !== null) v.rows.push(Rows.row("Clock", Format.formatFrequency(gpu.clock), null))
  if (gpu.fan !== null) v.rows.push(Rows.row("Fan", Format.formatPercent(gpu.fan), gpu.fan / 100, Format.gradientAt(g.level, gpu.fan / 100)))
  if (gpu.encoder) v.rows.push(Rows.row("Encode", Format.formatPercent(gpu.encoder), gpu.encoder / 100, Format.gradientAt(g.cpu, gpu.encoder / 100)))
  if (gpu.decoder) v.rows.push(Rows.row("Decode", Format.formatPercent(gpu.decoder), gpu.decoder / 100, Format.gradientAt(g.cpu, gpu.decoder / 100)))
}

// After a battery's level while it charges: a lightning bolt in the Nerd
// Font every Omarchy font setup has.
var CHARGING = "\u{f140b}"

// Units of width under which a disk's row leaves out its temperature.
var DISK_TEMP_SPAN = 26

var VIEWS = {
  gpu: function(v, state, palette, g, room, wide) {
    var gpu = Gpu.gpuRoles(state).main
    if (!gpu) { v.empty = state.time !== null && state.nvidiaMissing ? "No GPU found" : "Waiting for data"; return }
    gpuView(v, gpu, state.history.gpu, g, room, wide)
  },

  igpu: function(v, state, palette, g, room, wide) {
    var roles = Gpu.gpuRoles(state)
    if (roles.integrated) gpuView(v, roles.integrated, state.history.igpu, g, room, wide)
    else v.empty = roles.main && roles.main.kind === "integrated" ? "Shown as GPU" : "No integrated GPU"
  },
  cpu: function(v, state, palette, g, room, wide, span) {
    var cpu = state.cpu
    var groups = Format.coreGroups(state.sysinfo)
    v.info = !cpu.threads ? ""
      : groups ? groups.performance.length + " P + " + groups.efficient.length + " E threads"
      : cpu.threads + " threads"
    v.value = Format.formatPercent(cpu.total)
    v.valueColor = Format.gradientAt(g.cpu, (cpu.total || 0) / 100)
    // The clock rides beside the load, so the power draw can have its row;
    // beside the rows of a wide card the headline is too narrow for both,
    // and the clock takes a row there instead.
    var clockRow = cpu.frequency !== null && (wide || span < Rows.CLOCK_CAPTION_SPAN)
    v.caption = cpu.frequency !== null && !clockRow ? "load · " + Format.formatFrequency(cpu.frequency) : "load"
    v.graphs.push({ values: state.history.cpu, max: 100, stops: g.cpu, label: "" })
    function bar(load) { return { fraction: load / 100, color: Format.gradientAt(g.cpu, load / 100), gap: false } }
    if (groups) {
      // A hybrid CPU's performance threads, a gap, then its efficient
      // ones: one block of identical bars would hide which kind is busy.
      var byId = {}
      cpu.coreIds.forEach(function(id, i) { byId[id] = cpu.cores[i] })
      function loads(ids) { return ids.filter(function(id) { return byId[id] !== undefined }).map(function(id) { return bar(byId[id]) }) }
      var performance = loads(groups.performance), efficient = loads(groups.efficient)
      v.bars = performance.length && efficient.length ? performance.concat([{ fraction: 0, color: "", gap: true }], efficient) : cpu.cores.map(bar)
    } else v.bars = cpu.cores.map(bar)
    // The power first: the Temperatures panel has the temperature too.
    if (cpu.power !== null) {
      // Against the CPU's limit, blue to red, when it is known.
      var limit = Sys.cpuPowerLimit((state.sysinfo || {}).cpu, cpu.powerLimit)
      var used = limit ? Math.min(1, cpu.power / limit) : null
      v.rows.push(Rows.row("Power", limit ? Rows.watts(cpu.power) + " / " + Rows.watts(limit) + " W" : Rows.watts(cpu.power) + " W",
        used, limit ? Format.gradientAt(g.level, used) : ""))
    }
    if (cpu.temp !== null) {
      v.rows.push(Rows.heatRow("Temp", cpu.temp, cpu.tempLimit, g))
      if (Rows.hot(cpu.temp, cpu.tempLimit)) Rows.raise(v, Rows.ALERT)
    }
    if (clockRow) v.rows.push(Rows.row("Clock", Format.formatFrequency(cpu.frequency), null))
    if (cpu.loadavg.length) v.rows.push(Rows.loadRow(cpu.loadavg, cpu.threads, g, Rows.rowSpan(span, wide)))
    var stall = state.pressure && state.pressure.cpu
    if (stall !== null && stall !== undefined && stall >= Rows.STALL_SHOWN) {
      v.rows.push(Rows.stallRow(stall, g))
      if (stall >= Rows.ALERT_STALL) Rows.raise(v, Rows.ALERT)
    }
  },

  memory: function(v, state, palette, g) {
    var m = state.memory
    if (!m || !m.total) { v.empty = "Waiting for data"; return }
    var used = m.used / m.total
    v.info = Format.formatBytes(m.total)
    v.value = Format.formatPercent(used * 100)
    v.valueColor = Format.gradientAt(g.used, used)
    v.caption = "used"
    if (used >= Rows.ALERT_MEMORY) Rows.raise(v, Rows.ALERT)
    // One bar for the whole of memory: what is used, the cache the kernel
    // would hand back, and what is free. Used and available add up to the
    // total, so separate meters for them said the same thing twice, and a
    // graph of used memory is a flat line.
    var cached = Math.min(m.cached, m.available)
    var colors = { used: v.color, cached: Format.mix(v.color, palette.background, 0.55) }
    v.stack = [
      { fraction: used, color: colors.used },
      { fraction: cached / m.total, color: colors.cached }
    ]
    v.rows.push(Rows.keyRow("Used", Format.formatBytes(m.used), colors.used))
    v.rows.push(Rows.keyRow("Cached", Format.formatBytes(m.cached), colors.cached))
    v.rows.push(Rows.row("Available", Format.formatBytes(m.available), null))
    if (m.swapTotal) v.rows.push(Rows.row("Swap", Format.formatPair(m.swapUsed, m.swapTotal), m.swapUsed / m.swapTotal, Format.gradientAt(g.level, m.swapUsed / m.swapTotal)))
    var stall = state.pressure && state.pressure.memory
    if (stall !== null && stall !== undefined && stall >= Rows.STALL_SHOWN) {
      v.rows.push(Rows.stallRow(stall, g))
      if (stall >= Rows.ALERT_STALL) Rows.raise(v, Rows.ALERT)
    }
  },

  network: function(v, state, palette, g) {
    var n = state.network
    if (!n.interface) { v.empty = "No network"; return }
    v.info = n.interface
    // The graphs carry no text: over a spiky graph it is unreadable. The
    // rates are rows keyed to their graph's color, and each graph scales to
    // its own peak, which a row names: otherwise 30 KiB/s and 1 GiB/s draw
    // the same mountain.
    var rxMax = Rows.graphMax(state.history.rx, 10240), txMax = Rows.graphMax(state.history.tx, 10240)
    v.graphs.push({ values: state.history.rx, max: rxMax, stops: g.download, label: "" })
    v.graphs.push({ values: state.history.tx, max: txMax, stops: g.upload, label: "" })
    // Keyed by the graphs' low color, which a line shows most of the time.
    v.rows.push(Rows.keyRow("Down", Format.formatRate(n.rx), g.download[0]))
    v.rows.push(Rows.keyRow("Up", Format.formatRate(n.tx), g.upload[0]))
    // Ahead of the peaks and totals, which a short card drops first: whether
    // traffic goes through a VPN is what someone glancing over checks.
    // Green while one is on, red once it has gone off this session.
    // Where it comes out, as its client tells vpn.sh: "Proton VPN · Miami, US".
    if (n.vpn.length) {
      var vpnRow = Rows.keyRow("VPN", n.vpn.map(function(t) { return t.place ? t.name + " · " + t.place : t.name }).join(", "), g.level[0])
      vpnRow.tip = Rows.vpnTip(n.vpn)
      v.rows.push(vpnRow)
    }
    else if (n.vpnSeen) v.rows.push(Rows.keyRow("VPN", "off", palette.alert))
    // A mesh's address only comes when the panel's switch asks stats.sh
    // for it (STATS_TUNNEL_ADDRESS); a VPN's inner address says nothing
    // worth the room.
    n.mesh.forEach(function(t) {
      var meshRow = Rows.keyRow(t.name, Rows.meshText(t), g.upload[1])
      meshRow.tip = Rows.meshTip(t)
      v.rows.push(meshRow)
    })
    v.rows.push(Rows.row("Peak", "↓ " + Format.formatShort(rxMax) + "  ↑ " + Format.formatShort(txMax), null))
    // Both totals since boot on one row, so a card short of rows never
    // shows one without the other.
    v.rows.push(Rows.row("Total", "↓ " + Format.formatShort(n.rxTotal) + "  ↑ " + Format.formatShort(n.txTotal), null))
  },

  disks: function(v, state, palette, g, room, wide, span, shown) {
    if (!state.disks.length) { v.empty = "No disks"; return }
    // The graph of every disk's reads and writes scales to its busiest
    // second, which the title's corner names beside the disk count.
    var diskMax = Rows.graphMax(state.history.disk, 1048576)
    v.graphs.push({ values: state.history.disk, max: diskMax, stops: g.process, label: "" })
    var sensors = shown.indexOf("temps") !== -1
    if (state.disks.length === 1) {
      // One disk: its name in the title's corner, and a row each for what
      // a row per disk crams onto one line.
      var disk = state.disks[0]
      v.info = disk.name + " · peak " + Format.formatShort(diskMax) + "/s"
      v.rows.push(Rows.row("Read", Format.formatRate(disk.read), null))
      v.rows.push(Rows.row("Write", Format.formatRate(disk.write), null))
      if (disk.temp !== null && !sensors) v.rows.push(Rows.heatRow("Temp", disk.temp, disk.tempLimit, g))
      if (Rows.hot(disk.temp, disk.tempLimit)) Rows.raise(v, Rows.ALERT)
    }
    else v.info = state.disks.length + " disks · peak " + Format.formatShort(diskMax) + "/s"
    if (state.disks.length > 1) v.rows = state.disks.map(function(disk) {
      var text = "R " + Format.formatShort(disk.read) + "  W " + Format.formatShort(disk.write)
      // A narrow card has no room for it, and beside a Sensors panel it
      // would be there twice.
      if (disk.temp !== null && !sensors && !(Rows.rowSpan(span, wide) < DISK_TEMP_SPAN)) text += "  " + Format.formatTemp(disk.temp)
      if (Rows.hot(disk.temp, disk.tempLimit)) Rows.raise(v, Rows.ALERT)
      return Rows.row(disk.name, text, null)
    })
    var stall = state.pressure && state.pressure.io
    if (stall !== null && stall !== undefined && stall >= Rows.STALL_SHOWN) {
      v.rows.push(Rows.stallRow(stall, g))
      if (stall >= Rows.ALERT_STALL) Rows.raise(v, Rows.ALERT)
    }
  },

  // The programs using the most CPU, memory and video memory, each list
  // led by the busiest. A card with room for a title and a program per
  // list ranks them; a smaller one keeps the top program of each, on a
  // line that names its resource.
  processes: function(v, state, palette, g, room) {
    function cpu(p) { return { name: name(p), text: Format.formatPercent(p.cpu), fraction: Math.min(1, p.cpu / 100), color: Format.gradientAt(g.process, Math.min(1, p.cpu / 100)) } }
    var memTotal = state.memory && state.memory.total
    function memory(p) {
      var share = memTotal ? p.memory / memTotal : null
      return { name: name(p), text: Format.formatBytes(p.memory), fraction: share, color: Format.gradientAt(g.used, share || 0) }
    }
    var vramTotal = state.nvidia && state.nvidia.memTotal
    function vram(app) {
      var share = vramTotal ? app.memory / vramTotal : null
      return { name: app.name, text: Format.formatBytes(app.memory), fraction: share, color: Format.gradientAt(g.used, share || 0) }
    }
    function name(p) { return p.count > 1 ? p.name + " ×" + p.count : p.name }
    var lists = [
      { title: "CPU", items: state.processes.map(cpu), most: 5 },
      { title: "Memory", items: (state.memoryProcesses || []).map(memory), most: 3 }
    ]
    // Video memory per app comes from nvidia-smi only.
    if (state.nvidia || state.gpuApps.length) lists.push({ title: "VRAM", items: state.gpuApps.map(vram), most: 3 })

    // Each list takes its title and at least one line (an empty one says
    // "Nothing busy"); what room is over goes to the lists in order.
    if (room !== undefined && room < lists.length * 2) {
      // One line per resource: its top program, named for what it uses;
      // lines to spare go round the resources for their next programs.
      function line(list, i) {
        var item = list.items[i]
        return item ? Object.assign({}, item, { name: list.title + " · " + item.name }) : null
      }
      var items = lists.map(function(list) { return line(list, 0) || { name: list.title + " · nothing busy", text: "", fraction: null, color: "" } })
      for (var rank = 1; items.length < room; rank++) {
        var more = lists.map(function(list) { return line(list, rank) }).filter(Boolean)
        if (!more.length) break
        items = items.concat(more.slice(0, room - items.length))
      }
      v.lists.push({ title: "", items: items })
      return
    }
    // Spare lines go round the lists one at a time, so a short card ranks
    // a few of each rather than many programs and nothing else.
    var spare = room === undefined ? Infinity : room - lists.length * 2
    var counts = lists.map(function() { return 1 })
    for (var grew = true; grew && spare > 0;) {
      grew = false
      lists.forEach(function(list, i) {
        if (spare > 0 && counts[i] < list.most && counts[i] < list.items.length) { counts[i]++; spare--; grew = true }
      })
    }
    // Room the others leave goes to more busy programs.
    if (room !== undefined) counts[0] += Math.max(0, Math.min(spare, lists[0].items.length - counts[0]))
    lists.forEach(function(list, i) { v.lists.push({ title: list.title, items: list.items.slice(0, counts[i]) }) })
  },

  // Every sensor the other panels on the dashboard do not show: the CPU's
  // and its dies', the GPUs', NVMe drives' and memory modules'
  // temperatures, each against its own limit, then the fans. The hottest
  // for its limit leads; a graph of it would be a flat line.
  temps: function(v, state, palette, g, room, wide, span, shown) {
    function has(panel) { return shown.indexOf(panel) !== -1 }
    var roles = Gpu.gpuRoles(state)
    var temps = []
    function add(name, temp, limit) { if (temp !== null && temp !== undefined) temps.push({ name: name, temp: temp, limit: limit }) }
    state.temps.filter(function(t) { return !/^DIMM /.test(t.name) }).forEach(function(t) {
      // The CPU panel shows the CPU's own sensor; its dies are only here.
      if (!(t.name === "CPU" && has("cpu"))) add(t.name, t.temp, t.limit)
    })
    if (roles.main && !has("gpu")) add("GPU", roles.main.temp, roles.main.tempLimit)
    if (roles.integrated && !has("igpu")) add("iGPU", roles.integrated.temp, roles.integrated.tempLimit)
    Object.keys(state.nvmeTemps).sort().forEach(function(controller) {
      var disk = state.disks.filter(function(d) { return d.name.indexOf(controller + "n") === 0 })[0]
      add(disk ? disk.name : controller, state.nvmeTemps[controller], (state.nvmeLimits || {})[controller])
    })
    state.temps.filter(function(t) { return /^DIMM /.test(t.name) }).forEach(function(t) { add(t.name, t.temp, t.limit) })
    temps.forEach(function(t) { if (Rows.hot(t.temp, t.limit)) Rows.raise(v, Rows.ALERT) })

    // Beside the CPU panel a die would lead with nearly the CPU's own
    // reading, so the CPU's sensors lead only when nothing else can.
    function cpuSensor(t) { return t.name === "CPU" || /^CCD /.test(t.name) }
    var candidates = has("cpu") && temps.some(function(t) { return !cpuSensor(t) }) ? temps.filter(function(t) { return !cpuSensor(t) }) : temps
    var lead = null
    candidates.forEach(function(t) { if (!lead || Format.heat(t.temp, t.limit) > Format.heat(lead.temp, lead.limit)) lead = t })
    if (lead) {
      v.value = Format.formatTemp(lead.temp)
      v.valueColor = Format.gradientAt(g.level, Format.heat(lead.temp, lead.limit))
      // Its name and limit beside it; a wide card's headline is too narrow
      // for that caption, so they go on the line under the value.
      var limit = lead.limit ? "max " + Format.formatTemp(lead.limit) : ""
      if (wide) v.note = [lead.name, limit].filter(Boolean).join(" · ")
      else { v.caption = lead.name; v.info = limit }
    }
    v.rows = temps.filter(function(t) { return t !== lead }).map(function(t) { return Rows.heatRow(t.name, t.temp, t.limit, g) })
    // Fans against 3000 RPM, about as fast as a desktop's case and CPU
    // fans spin, and the GPU's in percent unless its panel has it.
    state.fans.forEach(function(fan) {
      v.rows.push(Rows.row(fan.name, fan.rpm + " RPM", fan.rpm / 3000, Format.gradientAt(g.level, fan.rpm / 3000)))
    })
    if (roles.main && roles.main.fan !== null && !has("gpu")) v.rows.push(Rows.row("GPU fan", Format.formatPercent(roles.main.fan), roles.main.fan / 100, Format.gradientAt(g.level, roles.main.fan / 100)))
    if (!lead && !v.rows.length) v.empty = shown.length ? "Every sensor is on its own panel" : "No sensors"
  },

  // Every battery: the laptop's, or else the emptiest peripheral's, leads
  // with a bar of its level and whether it charges; the rest are rows,
  // each with its meter. A laptop adds its draw, energy, health and cycles.
  battery: function(v, state, palette, g, room, wide) {
    var laptop = state.power.filter(function(b) { return !b.device })[0]
    var devices = state.power.filter(function(b) { return b.device })
    if (!laptop && !devices.length) { v.empty = "No batteries"; return }
    // A peripheral may report only a level; it reads as about this full.
    var LEVELS = { Critical: 5, Low: 20, Normal: 60, High: 85, Full: 100 }
    function percent(b) { return b.capacity !== null ? b.capacity : LEVELS[b.level] !== undefined ? LEVELS[b.level] : null }
    function charging(b) { return b.status === "Charging" }
    // A peripheral often reports no state at all (UPower's Unknown); only
    // one charging or full is known not to drain.
    function draining(b) { return b.status === "Discharging" || (b.device && !charging(b) && !/^Full/.test(b.status)) }
    function color(p) { return Format.gradientAt(g.level, 1 - (p || 0) / 100) }
    function hours(h) { return Math.floor(h) + "h " + Math.floor(h * 60) % 60 + "m" }
    // A device by its kind ("Mouse", "Headset") while no other shares it:
    // shorter than a model name ("Logitech G502 X LIGHTSPEED"), which a
    // narrow card cut to "G50…", and plainer. Two of a kind keep their
    // names, as does a device whose kind is unknown.
    function label(b) {
      var same = b.kind ? devices.filter(function(d) { return d.kind === b.kind }).length : 0
      return same === 1 ? b.kind : b.name
    }
    // Low and not on a charger: the card asks for attention, louder as it
    // empties, the laptop's and every peripheral's alike.
    var lowest = null
    state.power.forEach(function(b) {
      var p = percent(b)
      if (p === null || !draining(b) || p > Rows.BATTERY_LEVELS[0]) return
      Rows.BATTERY_LEVELS.forEach(function(threshold, i) { if (p <= threshold) Rows.raise(v, Rows.CAUTION + i) })
      if (!lowest || p < percent(lowest)) lowest = b
    })

    var known = devices.filter(function(b) { return percent(b) !== null })
    var lead = laptop || known.slice().sort(function(a, b) { return percent(a) - percent(b) })[0] || devices[0]
    var level = percent(lead)
    v.value = Format.formatPercent(level)
    v.valueColor = color(level)
    if (level !== null) v.stack = [{ fraction: level / 100, color: color(level) }]
    if (laptop) {
      if (laptop.status === "Discharging" && laptop.power > 0 && laptop.energy !== null) v.caption = hours(laptop.energy / laptop.power) + " left"
      else if (charging(laptop) && laptop.power > 0 && laptop.full !== null) v.caption = hours((laptop.full - laptop.energy) / laptop.power) + " to full"
      else v.caption = String(laptop.status || "").toLowerCase()
      v.info = charging(laptop) ? "charging" : laptop.status === "Discharging" ? "on battery" : ""
      // The emptiest peripheral too: a short card drops the device rows.
      var emptiest = known.slice().sort(function(a, b) { return percent(a) - percent(b) })[0]
      if (emptiest) v.info = label(emptiest) + " " + Format.formatPercent(percent(emptiest))
      if (laptop.power !== null) v.rows.push(Rows.row("Power", laptop.power.toFixed(1) + " W", null))
      if (laptop.energy !== null && laptop.full) v.rows.push(Rows.row("Energy", laptop.energy.toFixed(1) + " / " + laptop.full.toFixed(1) + " Wh", null))
      // Health against what it held new: low health is what wears out.
      if (laptop.health > 0) v.rows.push(Rows.row("Health", Format.formatPercent(laptop.health), laptop.health / 100, color(laptop.health)))
      if (laptop.cycles > 0) v.rows.push(Rows.row("Cycles", String(laptop.cycles), null))
    } else {
      // Beside the value a wide card's headline leaves the name about four
      // letters ("Mou…"); the line under the value has the column's width.
      var name = label(lead) + (charging(lead) ? "  ·  charging" : "")
      var tip = label(lead) === lead.name ? "" : lead.name
      if (wide) { v.note = name; v.noteTip = tip }
      else { v.caption = name; v.captionTip = tip }
      v.info = devices.length > 1 ? devices.length + " devices" : ""
      // What the device says of itself, where it says anything the caption
      // does not ("charging").
      if (lead.status && !/^(Unknown|Charging)$/.test(lead.status)) v.rows.push(Rows.row("Status", lead.status.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), null))
    }
    // How low the emptiest draining battery is, in words, while the card
    // warns; named when it is not the one leading the card.
    // After the lead's name in a wide card, which must still say whose the
    // big number is: "Mouse  ·  charging  ·  Headset low".
    if (lowest) {
      var warning = ["", "low", "very low", "critical"][v.alert]
      var low = lowest === lead ? warning : label(lowest) + " " + warning
      v.note = v.note ? v.note + "  ·  " + low : low
      if (lowest !== lead && label(lowest) !== lowest.name) v.noteTip = [v.noteTip, lowest.name].filter(Boolean).join("  ·  ")
    }
    devices.forEach(function(d) {
      // The peripheral leading the panel is not listed again.
      if (d === lead) return
      var p = percent(d)
      var deviceRow = Rows.row(label(d), (p !== null ? Format.formatPercent(p) : d.level || "—") + (charging(d) ? " " + CHARGING : ""),
        p === null ? null : p / 100, color(p))
      // Which headset it is, on hover: a kind alone does not say.
      if (deviceRow.label !== d.name) deviceRow.tip = d.name
      v.rows.push(deviceRow)
    })
  },

  media: function(v, state, palette, g) {
    var m = state.media
    if (!m || !m.title && !m.playing) { v.empty = "Nothing playing"; return }
    // A player that names no track (a browser tab, say) is named instead.
    v.info = m.title ? m.identity || "" : ""
    v.media = {
      title: m.title || m.identity || "Unknown player",
      artist: m.artist || "",
      album: m.album || "",
      art: Rows.localArtwork(m.art),
      playing: !!m.playing,
      progress: m.length > 0 ? Math.max(0, Math.min(1, m.position / m.length)) : null,
      // Without a length, a position (a browser's 0:00) tells nothing.
      time: m.length > 0 ? Format.formatDuration(m.position) + " / " + Format.formatDuration(m.length) : ""
    }
  },

  clock: ClockView.clockView,
  system: function(v, state, palette, g, room, wide, span, shown) {
    var system = state.system
    if (!system) { v.empty = "Waiting for data"; return }
    var info = state.sysinfo || {}
    v.info = info.user ? info.user + "@" + system.hostname : system.hostname
    v.logo = true
    // In fastfetch's order, the most telling first: a small card keeps those.
    function add(label, text) { if (text) v.rows.push(Rows.row(label, text, null)) }
    // A wide card is fastfetch's shape, the logo beside the facts: the
    // uptime joins the facts rather than taking the logo's column.
    if (system.uptime !== null && wide) add("Uptime", Format.formatUptime(system.uptime))
    else if (system.uptime !== null) { v.value = Format.formatUptime(system.uptime); v.caption = "up" }
    v.valueColor = palette.accent
    add("OS", [info.os, info.omarchy].filter(Boolean).join(" "))
    add("Channel", info.channel && info.channel !== "unknown" ? info.channel : "")
    add("Host", Sys.hostName(info))
    add("Kernel", system.kernel)
    add("CPU", Sys.shortCpu(info.cpu))
    var roles = Gpu.gpuRoles(state)
    if (roles.main) add("GPU", roles.main.name)
    if (roles.integrated) add("iGPU", roles.integrated.name)
    // Live numbers another panel on the dashboard already shows are left
    // to it.
    if (state.memory && state.memory.total && shown.indexOf("memory") === -1) add("Memory", Format.formatPair(state.memory.used, state.memory.total))
    var packages = []
    if (Number(info.packages) > 0) packages.push(info.packages + " pacman")
    if (Number(info.flatpaks) > 0) packages.push(info.flatpaks + " flatpak")
    add("Packages", packages.join(", "))
    add("Shell", info.shell)
    add("Desktop", info.desktop)
    add("Theme", Sys.themeName(info.theme))
    if (state.cpu.loadavg.length && shown.indexOf("cpu") === -1) v.rows.push(Rows.loadRow(state.cpu.loadavg, state.cpu.threads, g, Rows.rowSpan(span, wide)))
    if (state.threads !== null) v.rows.push(Rows.row("Threads", String(state.threads), null))
  }
}
