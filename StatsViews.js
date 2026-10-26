.pragma library
.import "Stats.js" as Stats

// The stats fill's drawing, without any QML: how the panels tile a strip
// and what each panel shows, from the state and palette Stats.js makes.

// --- layout ------------------------------------------------------------------

// The dashboard's base size, its text height in pixels, for a strip of
// `width` by `height`: an eighth of the short side, within readable bounds.
function unitFor(width, height) {
  return Math.max(9, Math.min(18, Math.floor(Math.min(width, height) / 8)))
}

// Cards are about this wide for their height, and never smaller than this
// many units.
var CARD_ASPECT = 1.8
var CARD_MIN_WIDTH = 14
var CARD_MIN_HEIGHT = 6

// Units of height a card needs for its content: stacked, and wide with
// its rows beside the graphs. A card is wide past this width for its
// height. A short strip is all wide cards, and there larger text with a
// row or two fewer reads better than every row at 9 or 10 px: at 8 units
// a 160 px strip keeps 16 px text and three rows.
var CARD_ROOM = 14
var WIDE_ROOM = 8
var WIDE_CARD = 2
// Units of width a wide card needs for its headline and rows side by
// side. Its height alone let a 300 px card on a portrait strip take 16 px
// text, and every label and value was cut short.
var WIDE_SPAN = 22

function roomy(card, unit) {
  if (card.width > card.height * WIDE_CARD) return card.height >= WIDE_ROOM * unit && card.width >= WIDE_SPAN * unit
  return card.height >= CARD_ROOM * unit
}

// The layout with the largest text that keeps every panel and gives each
// card room for its content: unitFor's size for a few panels, smaller for
// a crowded grid. When nothing makes room, the smallest text shows what
// fits. Returns layout's result with its `unit`.
function fit(panels, width, height) {
  // Not laid out yet: nothing to draw.
  if (!(width > 0 && height > 0)) return { unit: 9, cards: [], dropped: panels.slice() }
  for (var unit = unitFor(width, height); unit >= 9; unit--) {
    var grid = layout(panels, width, height, unit)
    if (grid.dropped.length) continue
    if (grid.cards.every(function(card) { return roomy(card, unit) })) return { unit: unit, cards: grid.cards, dropped: grid.dropped }
  }
  var fallback = layout(panels, width, height, 9)
  return { unit: 9, cards: fallback.cards, dropped: fallback.dropped }
}

// Where each of `panels` goes on a `width` by `height` strip with text
// `unit` pixels high: a grid with a unit of margin and gap, the columns and
// rows picked for the largest cards near CARD_ASPECT, a short last row
// stretched across. Panels that do not fit even one to a card are dropped
// from the end. Returns { cards: [{ panel, x, y, width, height }], dropped }.
function layout(panels, width, height, unit) {
  var gap = unit
  var innerWidth = width - 2 * unit, innerHeight = height - 2 * unit
  for (var count = panels.length; count > 0; count--) {
    var best = null
    for (var columns = 1; columns <= count; columns++) {
      var rows = Math.ceil(count / columns)
      var cardWidth = (innerWidth - gap * (columns - 1)) / columns
      var cardHeight = (innerHeight - gap * (rows - 1)) / rows
      if (cardWidth < CARD_MIN_WIDTH * unit || cardHeight < CARD_MIN_HEIGHT * unit) continue
      var score = Math.min(cardWidth, cardHeight * CARD_ASPECT)
      if (!best || score > best.score) best = { score: score, columns: columns, rows: rows, height: cardHeight }
    }
    if (!best) continue
    var cards = []
    for (var i = 0; i < count; i++) {
      var row = Math.floor(i / best.columns)
      var inRow = row === best.rows - 1 ? count - row * best.columns : best.columns
      var w = (innerWidth - gap * (inRow - 1)) / inRow
      cards.push({
        panel: panels[i],
        x: unit + (i % best.columns) * (w + gap),
        y: unit + row * (best.height + gap),
        width: w,
        height: best.height
      })
    }
    return { cards: cards, dropped: panels.slice(count) }
  }
  return { cards: [], dropped: panels.slice() }
}

// --- views -------------------------------------------------------------------

var ICONS = {
  gpu: "\u{f08ae}", igpu: "\u{f08ae}", temps: "\u{f050f}", battery: "\u{f0079}", media: "\u{f075a}", system: "\u{f02fd}", cpu: "\u{f061a}", memory: "\u{f035b}", network: "\u{f0200}",
  disks: "\u{f02ca}", processes: "\u{f0279}"
}
var TITLES = { gpu: "GPU", igpu: "iGPU", temps: "Sensors", battery: "Battery", media: "Now playing", system: "System", cpu: "CPU", memory: "Memory", network: "Network", disks: "Disks", processes: "Processes" }

function row(label, text, fraction, color) {
  return { label: label, text: text, fraction: fraction === null || fraction === undefined ? null : Math.max(0, Math.min(1, fraction)), color: color || "", swatch: false, tip: "" }
}

// A row with no meter whose label carries a square of `color`: the key to
// a part of the view's stacked bar.
function keyRow(label, text, color) {
  return { label: label, text: text, fraction: null, color: color, swatch: true }
}

// Where a card turns to its warning color, so trouble shows from across
// the room: a sensor this many °C from its limit, memory or video memory
// this full, tasks stalled this share of the last 10 s, a battery this low
// and draining.
// How loudly a card asks: CAUTION turns it yellow, ALERT red, and
// CRITICAL red with its title filled in. Most readings only alert; a
// battery steps through all three as it empties.
var CAUTION = 1
var ALERT = 2
var CRITICAL = 3

function raise(v, level) {
  if (level > v.alert) v.alert = level
}

var ALERT_HEAT_MARGIN = 5
var ALERT_MEMORY = 0.9
var ALERT_VRAM = 0.95
var ALERT_STALL = 10
// A battery's levels, low to critical, for CAUTION, ALERT and CRITICAL.
var BATTERY_LEVELS = [15, 10, 5]

function hot(temp, limit) {
  return temp !== null && temp !== undefined && limit > 0 && temp >= limit - ALERT_HEAT_MARGIN
}

// A temperature row, its meter filling from HEAT_FLOOR to the sensor's
// limit, green through yellow to red like every level meter.
function heatRow(label, temp, limit, g) {
  var level = Stats.heat(temp, limit)
  return row(label, Stats.formatTemp(temp), level, Stats.gradientAt(g.level, level))
}

// Stalls below this share of the last 10 s are left off: a row reading
// 0.0% all day only takes room.
var STALL_SHOWN = 1

// A row for the share of the last 10 s tasks stalled on one resource
// (pressure stall information). Its meter reaches the red end of the level
// scale where the card alerts, ALERT_STALL, so a red card never shows the
// cause as a green meter.
function stallRow(value, g) {
  var level = Math.min(1, value / ALERT_STALL * 0.8)
  return row("Stalled", value.toFixed(1) + "%", level, Stats.gradientAt(g.level, level))
}

// Units of width from which the load average names its minutes.
var LOAD_LABEL_SPAN = 22
// Units of width under which the CPU's clock leaves the headline's
// caption ("load · 5.30 GHz") for a row of its own.
var CLOCK_CAPTION_SPAN = 24

// The units of width a card's rows get: all of it in a stacked card, the
// rows' three fifths of it beside the headline in a wide one.
function rowSpan(span, wide) {
  return wide ? Math.floor(span * 0.6) : span
}

// The 1, 5 and 15 minute load averages, a meter for the first against the
// number of threads, where a load of one per thread is a busy CPU.
function loadRow(loadavg, threads, g, span) {
  var numbers = loadavg.map(function(n) { return n.toFixed(2) })
  var text = span >= LOAD_LABEL_SPAN
    ? ["1m", "5m", "15m"].map(function(name, i) { return name + " " + numbers[i] }).join("  ")
    : numbers.join("  ")
  var level = threads > 0 ? loadavg[0] / threads : null
  return row("Load", text, level, level === null ? "" : Stats.gradientAt(g.level, level))
}

// MPRIS art URLs come from players (and, for browser players, pages). Qt's
// Image accepts network URLs, so only local artwork belongs in this panel.
function localArtwork(url) {
  var value = String(url || "")
  return value.length <= 4096 && /^file:\/\/\/[^/\\\x00-\x1f]/.test(value) && !/[\\\x00-\x1f]/.test(value) ? value : ""
}

// A graph's top: its largest value, at least `floor`.
function graphMax(values, floor) {
  return Math.max.apply(null, [floor].concat(values))
}

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
    graphs: [], bars: [], stack: [], rows: [], lists: [], empty: "", logo: false, alert: 0
  }
  var build = VIEWS[panel]
  if (build) build(result, state, palette, g, room, wide, span, shown || [])
  if (room !== undefined && wide) fitHeadline(result, room)
  if (room !== undefined) result.rows = result.rows.slice(0, rowsThatFit(result, room, wide))
  return result
}

// Whether `panel` has anything to show on this machine, once the sampler
// has reported: a dashboard leaves out an iGPU panel without a second GPU
// and a Battery panel without a battery rather than give them a card that
// only says so. Before the first frame every panel counts.
function available(panel, state) {
  if (!state || state.time === null) return true
  if (panel === "igpu") return Stats.gpuRoles(state).integrated !== null
  if (panel === "battery") return state.power.length > 0
  return true
}

// The panels of `panels` that have something to show, in their order.
function availablePanels(panels, state) {
  return panels.filter(function(panel) { return available(panel, state) })
}

// Rows' room each part of a stacked card's headline takes: the big value,
// a graph at its smallest, the per-core bars, the stacked bar, and the gap
// below them. A row is a line of text and its spacing.
var VALUE_ROWS = 1.8
var GRAPH_ROWS = 1
var BARS_ROWS = 1.4
var STACK_ROWS = 0.8
var NOTE_ROWS = 0.8
var GAP_ROWS = 0.3

// How many of a view's rows fit `room` rows: all of it beside the headline
// in a wide card, what the headline leaves in a stacked one. Rows that would be cut in half are left
// out, and whatever room is over goes to the graphs.
function rowsThatFit(v, room, wide) {
  if (wide) return Math.max(0, room)
  var headline = headlineRows(v)
  if (headline > 0) headline += GAP_ROWS
  return Math.max(0, Math.floor(room - headline + 1e-9))
}

// Rows' room a view's headline takes, without the gap below it.
function headlineRows(v) {
  return (v.value ? VALUE_ROWS : 0) + (v.note ? NOTE_ROWS : 0) + v.graphs.length * GRAPH_ROWS + (v.bars.length ? BARS_ROWS : 0) + (v.stack.length ? STACK_ROWS : 0)
}

// A wide card's headline has the card's `room` rows beside the rows, and
// what does not fit is left out rather than squeezed to a sliver: the
// per-core bars first (the load graph says the same in one line), then
// the stacked bar, the note unless it carries a warning, and graphs after
// the first. Nothing sits under it, so it may use the gap a stacked card
// keeps below its headline.
function fitHeadline(v, room) {
  var over = function() { return headlineRows(v) > room + GAP_ROWS }
  if (over() && v.bars.length) v.bars = []
  if (over() && v.stack.length) v.stack = []
  if (over() && v.note && !v.alert) v.note = ""
  while (over() && v.graphs.length > 1) v.graphs = v.graphs.slice(0, -1)
}

// The rows of a GPU panel for one GPU, whichever its vendor: load with
// its `history`, then every reading it has.
function gpuView(v, gpu, history, g, room, wide) {
  v.info = gpu.name
  if (gpu.asleep) { v.empty = "Asleep"; return }
  v.value = Stats.formatPercent(gpu.load)
  v.valueColor = Stats.gradientAt(g.cpu, (gpu.load || 0) / 100)
  v.caption = gpu.resting ? "idle" : "load"
  v.graphs.push({ values: history, max: 100, stops: g.cpu, label: "" })
  if (gpu.memUsed !== null && gpu.memTotal) {
    var vram = gpu.memUsed / gpu.memTotal
    v.rows.push(row("VRAM", Stats.formatPair(gpu.memUsed, gpu.memTotal), vram, Stats.gradientAt(g.level, vram)))
    if (vram >= ALERT_VRAM) raise(v, ALERT)
  }
  if (gpu.temp !== null) {
    v.rows.push(heatRow("Temp", gpu.temp, gpu.tempLimit, g))
    if (hot(gpu.temp, gpu.tempLimit)) raise(v, ALERT)
  }
  if (gpu.power !== null) {
    var limit = gpu.powerLimit
    v.rows.push(row("Power", limit ? watts(gpu.power) + " / " + watts(limit) + " W" : watts(gpu.power) + " W",
      limit ? gpu.power / limit : null, limit ? Stats.gradientAt(g.level, gpu.power / limit) : ""))
  }
  if (gpu.clock !== null) v.rows.push(row("Clock", Stats.formatFrequency(gpu.clock), null))
  if (gpu.fan !== null) v.rows.push(row("Fan", Stats.formatPercent(gpu.fan), gpu.fan / 100, Stats.gradientAt(g.level, gpu.fan / 100)))
  if (gpu.encoder) v.rows.push(row("Encode", Stats.formatPercent(gpu.encoder), gpu.encoder / 100, Stats.gradientAt(g.cpu, gpu.encoder / 100)))
  if (gpu.decoder) v.rows.push(row("Decode", Stats.formatPercent(gpu.decoder), gpu.decoder / 100, Stats.gradientAt(g.cpu, gpu.decoder / 100)))
}

// After a battery's level while it charges: a lightning bolt in the Nerd
// Font every Omarchy font setup has.
var CHARGING = "\u{f140b}"

// Units of width under which a disk's row leaves out its temperature.
var DISK_TEMP_SPAN = 26

// Watts, with a decimal below 10: an iGPU draws fractions of one.
function watts(value) {
  return value < 10 ? value.toFixed(1) : String(Math.round(value))
}

var VIEWS = {
  gpu: function(v, state, palette, g, room, wide) {
    var gpu = Stats.gpuRoles(state).main
    if (!gpu) { v.empty = state.time !== null && state.nvidiaMissing ? "No GPU found" : "Waiting for data"; return }
    gpuView(v, gpu, state.history.gpu, g, room, wide)
  },

  igpu: function(v, state, palette, g, room, wide) {
    var roles = Stats.gpuRoles(state)
    if (roles.integrated) gpuView(v, roles.integrated, state.history.igpu, g, room, wide)
    else v.empty = roles.main && roles.main.kind === "integrated" ? "Shown as GPU" : "No integrated GPU"
  },
  cpu: function(v, state, palette, g, room, wide, span) {
    var cpu = state.cpu
    var groups = Stats.coreGroups(state.sysinfo)
    v.info = !cpu.threads ? ""
      : groups ? groups.performance.length + " P + " + groups.efficient.length + " E threads"
      : cpu.threads + " threads"
    v.value = Stats.formatPercent(cpu.total)
    v.valueColor = Stats.gradientAt(g.cpu, (cpu.total || 0) / 100)
    // The clock rides beside the load, so the power draw can have its row;
    // beside the rows of a wide card the headline is too narrow for both,
    // and the clock takes a row there instead.
    var clockRow = cpu.frequency !== null && (wide || span < CLOCK_CAPTION_SPAN)
    v.caption = cpu.frequency !== null && !clockRow ? "load · " + Stats.formatFrequency(cpu.frequency) : "load"
    v.graphs.push({ values: state.history.cpu, max: 100, stops: g.cpu, label: "" })
    function bar(load) { return { fraction: load / 100, color: Stats.gradientAt(g.cpu, load / 100), gap: false } }
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
      var limit = Stats.cpuPowerLimit((state.sysinfo || {}).cpu, cpu.powerLimit)
      var used = limit ? Math.min(1, cpu.power / limit) : null
      v.rows.push(row("Power", limit ? watts(cpu.power) + " / " + watts(limit) + " W" : watts(cpu.power) + " W",
        used, limit ? Stats.gradientAt(g.level, used) : ""))
    }
    if (cpu.temp !== null) {
      v.rows.push(heatRow("Temp", cpu.temp, cpu.tempLimit, g))
      if (hot(cpu.temp, cpu.tempLimit)) raise(v, ALERT)
    }
    if (clockRow) v.rows.push(row("Clock", Stats.formatFrequency(cpu.frequency), null))
    if (cpu.loadavg.length) v.rows.push(loadRow(cpu.loadavg, cpu.threads, g, rowSpan(span, wide)))
    var stall = state.pressure && state.pressure.cpu
    if (stall !== null && stall !== undefined && stall >= STALL_SHOWN) {
      v.rows.push(stallRow(stall, g))
      if (stall >= ALERT_STALL) raise(v, ALERT)
    }
  },

  memory: function(v, state, palette, g) {
    var m = state.memory
    if (!m || !m.total) { v.empty = "Waiting for data"; return }
    var used = m.used / m.total
    v.info = Stats.formatBytes(m.total)
    v.value = Stats.formatPercent(used * 100)
    v.valueColor = Stats.gradientAt(g.used, used)
    v.caption = "used"
    if (used >= ALERT_MEMORY) raise(v, ALERT)
    // One bar for the whole of memory: what is used, the cache the kernel
    // would hand back, and what is free. Used and available add up to the
    // total, so separate meters for them said the same thing twice, and a
    // graph of used memory is a flat line.
    var cached = Math.min(m.cached, m.available)
    var colors = { used: v.color, cached: Stats.mix(v.color, palette.background, 0.55) }
    v.stack = [
      { fraction: used, color: colors.used },
      { fraction: cached / m.total, color: colors.cached }
    ]
    v.rows.push(keyRow("Used", Stats.formatBytes(m.used), colors.used))
    v.rows.push(keyRow("Cached", Stats.formatBytes(m.cached), colors.cached))
    v.rows.push(row("Available", Stats.formatBytes(m.available), null))
    if (m.swapTotal) v.rows.push(row("Swap", Stats.formatPair(m.swapUsed, m.swapTotal), m.swapUsed / m.swapTotal, Stats.gradientAt(g.level, m.swapUsed / m.swapTotal)))
    var stall = state.pressure && state.pressure.memory
    if (stall !== null && stall !== undefined && stall >= STALL_SHOWN) {
      v.rows.push(stallRow(stall, g))
      if (stall >= ALERT_STALL) raise(v, ALERT)
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
    var rxMax = graphMax(state.history.rx, 10240), txMax = graphMax(state.history.tx, 10240)
    v.graphs.push({ values: state.history.rx, max: rxMax, stops: g.download, label: "" })
    v.graphs.push({ values: state.history.tx, max: txMax, stops: g.upload, label: "" })
    // Keyed by the graphs' low color, which a line shows most of the time.
    v.rows.push(keyRow("Down", Stats.formatRate(n.rx), g.download[0]))
    v.rows.push(keyRow("Up", Stats.formatRate(n.tx), g.upload[0]))
    v.rows.push(row("Peak", "↓ " + Stats.formatShort(rxMax) + "  ↑ " + Stats.formatShort(txMax), null))
    // Both totals since boot on one row, so a card short of rows never
    // shows one without the other.
    v.rows.push(row("Total", "↓ " + Stats.formatShort(n.rxTotal) + "  ↑ " + Stats.formatShort(n.txTotal), null))
  },

  disks: function(v, state, palette, g, room, wide, span, shown) {
    if (!state.disks.length) { v.empty = "No disks"; return }
    // The graph of every disk's reads and writes scales to its busiest
    // second, which the title's corner names beside the disk count.
    var diskMax = graphMax(state.history.disk, 1048576)
    v.graphs.push({ values: state.history.disk, max: diskMax, stops: g.process, label: "" })
    var sensors = shown.indexOf("temps") !== -1
    if (state.disks.length === 1) {
      // One disk: its name in the title's corner, and a row each for what
      // a row per disk crams onto one line.
      var disk = state.disks[0]
      v.info = disk.name + " · peak " + Stats.formatShort(diskMax) + "/s"
      v.rows.push(row("Read", Stats.formatRate(disk.read), null))
      v.rows.push(row("Write", Stats.formatRate(disk.write), null))
      if (disk.temp !== null && !sensors) v.rows.push(heatRow("Temp", disk.temp, disk.tempLimit, g))
      if (hot(disk.temp, disk.tempLimit)) raise(v, ALERT)
    }
    else v.info = state.disks.length + " disks · peak " + Stats.formatShort(diskMax) + "/s"
    if (state.disks.length > 1) v.rows = state.disks.map(function(disk) {
      var text = "R " + Stats.formatShort(disk.read) + "  W " + Stats.formatShort(disk.write)
      // A narrow card has no room for it, and beside a Sensors panel it
      // would be there twice.
      if (disk.temp !== null && !sensors && !(rowSpan(span, wide) < DISK_TEMP_SPAN)) text += "  " + Stats.formatTemp(disk.temp)
      if (hot(disk.temp, disk.tempLimit)) raise(v, ALERT)
      return row(disk.name, text, null)
    })
    var stall = state.pressure && state.pressure.io
    if (stall !== null && stall !== undefined && stall >= STALL_SHOWN) {
      v.rows.push(stallRow(stall, g))
      if (stall >= ALERT_STALL) raise(v, ALERT)
    }
  },

  // The programs using the most CPU, memory and video memory, each list
  // led by the busiest. A card with room for a title and a program per
  // list ranks them; a smaller one keeps the top program of each, on a
  // line that names its resource.
  processes: function(v, state, palette, g, room) {
    function cpu(p) { return { name: name(p), text: Stats.formatPercent(p.cpu), fraction: Math.min(1, p.cpu / 100), color: Stats.gradientAt(g.process, Math.min(1, p.cpu / 100)) } }
    var memTotal = state.memory && state.memory.total
    function memory(p) {
      var share = memTotal ? p.memory / memTotal : null
      return { name: name(p), text: Stats.formatBytes(p.memory), fraction: share, color: Stats.gradientAt(g.used, share || 0) }
    }
    var vramTotal = state.nvidia && state.nvidia.memTotal
    function vram(app) {
      var share = vramTotal ? app.memory / vramTotal : null
      return { name: app.name, text: Stats.formatBytes(app.memory), fraction: share, color: Stats.gradientAt(g.used, share || 0) }
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
    var roles = Stats.gpuRoles(state)
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
    temps.forEach(function(t) { if (hot(t.temp, t.limit)) raise(v, ALERT) })

    // Beside the CPU panel a die would lead with nearly the CPU's own
    // reading, so the CPU's sensors lead only when nothing else can.
    function cpuSensor(t) { return t.name === "CPU" || /^CCD /.test(t.name) }
    var candidates = has("cpu") && temps.some(function(t) { return !cpuSensor(t) }) ? temps.filter(function(t) { return !cpuSensor(t) }) : temps
    var lead = null
    candidates.forEach(function(t) { if (!lead || Stats.heat(t.temp, t.limit) > Stats.heat(lead.temp, lead.limit)) lead = t })
    if (lead) {
      v.value = Stats.formatTemp(lead.temp)
      v.valueColor = Stats.gradientAt(g.level, Stats.heat(lead.temp, lead.limit))
      // Its name and limit beside it; a wide card's headline is too narrow
      // for that caption, so they go on the line under the value.
      var limit = lead.limit ? "max " + Stats.formatTemp(lead.limit) : ""
      if (wide) v.note = [lead.name, limit].filter(Boolean).join(" · ")
      else { v.caption = lead.name; v.info = limit }
    }
    v.rows = temps.filter(function(t) { return t !== lead }).map(function(t) { return heatRow(t.name, t.temp, t.limit, g) })
    // Fans against 3000 RPM, about as fast as a desktop's case and CPU
    // fans spin, and the GPU's in percent unless its panel has it.
    state.fans.forEach(function(fan) {
      v.rows.push(row(fan.name, fan.rpm + " RPM", fan.rpm / 3000, Stats.gradientAt(g.level, fan.rpm / 3000)))
    })
    if (roles.main && roles.main.fan !== null && !has("gpu")) v.rows.push(row("GPU fan", Stats.formatPercent(roles.main.fan), roles.main.fan / 100, Stats.gradientAt(g.level, roles.main.fan / 100)))
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
    function color(p) { return Stats.gradientAt(g.level, 1 - (p || 0) / 100) }
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
      if (p === null || !draining(b) || p > BATTERY_LEVELS[0]) return
      BATTERY_LEVELS.forEach(function(threshold, i) { if (p <= threshold) raise(v, CAUTION + i) })
      if (!lowest || p < percent(lowest)) lowest = b
    })

    var known = devices.filter(function(b) { return percent(b) !== null })
    var lead = laptop || known.slice().sort(function(a, b) { return percent(a) - percent(b) })[0] || devices[0]
    var level = percent(lead)
    v.value = Stats.formatPercent(level)
    v.valueColor = color(level)
    if (level !== null) v.stack = [{ fraction: level / 100, color: color(level) }]
    if (laptop) {
      if (laptop.status === "Discharging" && laptop.power > 0 && laptop.energy !== null) v.caption = hours(laptop.energy / laptop.power) + " left"
      else if (charging(laptop) && laptop.power > 0 && laptop.full !== null) v.caption = hours((laptop.full - laptop.energy) / laptop.power) + " to full"
      else v.caption = String(laptop.status || "").toLowerCase()
      v.info = charging(laptop) ? "charging" : laptop.status === "Discharging" ? "on battery" : ""
      if (laptop.power !== null) v.rows.push(row("Power", laptop.power.toFixed(1) + " W", null))
      if (laptop.energy !== null && laptop.full) v.rows.push(row("Energy", laptop.energy.toFixed(1) + " / " + laptop.full.toFixed(1) + " Wh", null))
      // Health against what it held new: low health is what wears out.
      if (laptop.health > 0) v.rows.push(row("Health", Stats.formatPercent(laptop.health), laptop.health / 100, color(laptop.health)))
      if (laptop.cycles > 0) v.rows.push(row("Cycles", String(laptop.cycles), null))
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
      if (lead.status && !/^(Unknown|Charging)$/.test(lead.status)) v.rows.push(row("Status", lead.status.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), null))
    }
    // How low the emptiest draining battery is, in words, while the card
    // warns; named when it is not the one leading the card.
    // On the name's line in a wide card, after it when it is the lead's.
    if (lowest) {
      var warning = ["", "low", "very low", "critical"][v.alert]
      if (lowest !== lead) { v.note = label(lowest) + " " + warning; v.noteTip = label(lowest) === lowest.name ? "" : lowest.name }
      else v.note = v.note ? v.note + "  ·  " + warning : warning
    }
    devices.forEach(function(d) {
      // The peripheral leading the panel is not listed again.
      if (d === lead) return
      var p = percent(d)
      var deviceRow = row(label(d), (p !== null ? Stats.formatPercent(p) : d.level || "—") + (charging(d) ? " " + CHARGING : ""),
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
      art: localArtwork(m.art),
      playing: !!m.playing,
      progress: m.length > 0 ? Math.max(0, Math.min(1, m.position / m.length)) : null,
      // Without a length, a position (a browser's 0:00) tells nothing.
      time: m.length > 0 ? Stats.formatDuration(m.position) + " / " + Stats.formatDuration(m.length) : ""
    }
  },

  system: function(v, state, palette, g, room, wide, span, shown) {
    var system = state.system
    if (!system) { v.empty = "Waiting for data"; return }
    var info = state.sysinfo || {}
    v.info = info.user ? info.user + "@" + system.hostname : system.hostname
    v.logo = true
    // In fastfetch's order, the most telling first: a small card keeps those.
    function add(label, text) { if (text) v.rows.push(row(label, text, null)) }
    // A wide card is fastfetch's shape, the logo beside the facts: the
    // uptime joins the facts rather than taking the logo's column.
    if (system.uptime !== null && wide) add("Uptime", Stats.formatUptime(system.uptime))
    else if (system.uptime !== null) { v.value = Stats.formatUptime(system.uptime); v.caption = "up" }
    v.valueColor = palette.accent
    add("OS", [info.os, info.omarchy].filter(Boolean).join(" "))
    add("Channel", info.channel && info.channel !== "unknown" ? info.channel : "")
    add("Host", Stats.hostName(info))
    add("Kernel", system.kernel)
    add("CPU", Stats.shortCpu(info.cpu))
    var roles = Stats.gpuRoles(state)
    if (roles.main) add("GPU", roles.main.name)
    if (roles.integrated) add("iGPU", roles.integrated.name)
    // Live numbers another panel on the dashboard already shows are left
    // to it.
    if (state.memory && state.memory.total && shown.indexOf("memory") === -1) add("Memory", Stats.formatPair(state.memory.used, state.memory.total))
    var packages = []
    if (Number(info.packages) > 0) packages.push(info.packages + " pacman")
    if (Number(info.flatpaks) > 0) packages.push(info.flatpaks + " flatpak")
    add("Packages", packages.join(", "))
    add("Shell", info.shell)
    add("Desktop", info.desktop)
    add("Theme", Stats.themeName(info.theme))
    if (state.cpu.loadavg.length && shown.indexOf("cpu") === -1) v.rows.push(loadRow(state.cpu.loadavg, state.cpu.threads, g, rowSpan(span, wide)))
    if (state.threads !== null) v.rows.push(row("Threads", String(state.threads), null))
  }
}
