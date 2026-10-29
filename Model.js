.pragma library

// The plugin's settings and what they mean, without any QML: each monitor's
// entry, its fill and stats panels, and the panel's pages. The clock and
// logo bitmaps are in ModelArt.js, edge sizes and presets in ModelEdges.js,
// profiles in ModelProfiles.js.

var EDGES = ["top", "bottom", "left", "right"]

// What a reserved edge shows. Black is the default and the only one that is
// safe on OLED panels; the others keep a static image in the same place
// (the clock shifts a little now and then, but its digits stay lit).
var FILLS = ["black", "theme", "logo", "wallpaper", "dim", "clock", "stats"]

var FILL_NAMES = { black: "Black", theme: "Theme", wallpaper: "Wallpaper", dim: "Dimmed", logo: "Logo", clock: "Clock", stats: "Stats" }

// Fills drawn once per monitor, on the edge clockEdge picks; the other
// edges stay black.
var SINGLE_FILLS = ["clock", "stats"]

// The stats fill's panels, in the order the panel lists them. A monitor
// shows its own choice of them in its own order, and the dashboard drops
// them from the end of that order when the strip runs out of room.
// `temps` is the Sensors panel: its key predates the fans joining it.
var STATS_PANELS = ["gpu", "igpu", "cpu", "memory", "network", "disks", "processes", "temps", "battery", "media", "system", "clock"]

var STATS_DEFAULT = ["gpu", "cpu", "memory", "network"]

var PANEL_NAMES = { gpu: "GPU", igpu: "iGPU", cpu: "CPU", memory: "Memory", network: "Network", disks: "Disks", processes: "Processes", temps: "Sensors", battery: "Battery", media: "Now playing", system: "System", clock: "Clock" }

// Other names IPC accepts for a panel.
var PANEL_ALIASES = { mem: "memory", ram: "memory", net: "network", disk: "disks", io: "disks", procs: "processes", "top processes": "processes", fan: "temps", fans: "temps", integrated: "igpu",

  temperatures: "temps", temp: "temps", temps: "temps", sensors: "temps", bat: "battery", music: "media", mpris: "media", nowplaying: "media", uptime: "system",
  time: "clock", date: "clock", reminders: "clock", sun: "clock" }
// Panels of earlier versions, as stored in settings and profiles: the Fans
// panel became part of Sensors, and the Pressure panel's numbers became
// rows on the CPU, Memory and Disks panels.
var RETIRED_PANELS = { fans: "temps", pressure: "" }

// Where the clock fill goes: the largest reserved edge, or the larger of
// the top and bottom edges.
var CLOCK_EDGES = ["largest", "topBottom"]

// The clock fill's hours: 24-hour, or 12-hour without a leading zero.
var CLOCK_HOURS = [24, 12]

// What the clock fill does every second, against burn-in on OLED panels:
// nothing, the colon blinks, or a bar under the time fills over the minute.
var CLOCK_SECONDS = ["off", "blink", "bar"]

var CLOCK_SECONDS_NAMES = { off: "Off", blink: "Blinking colon", bar: "Seconds bar" }

// How dark the dimmed fill makes the wallpaper, in percent.
var DIM_DEFAULT = 60

var DIM_MIN = 10

var DIM_MAX = 90

// A dim amount from a hand edit or IPC: whole percent within the range,
// the default for anything that is not a number.
function dimPercent(value) {
  var number = Number(value)
  if (value === null || value === undefined || value === "" || !isFinite(number)) return DIM_DEFAULT
  return clamp(Math.round(number), DIM_MIN, DIM_MAX)
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

function pixels(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

function isHorizontal(side) {
  return side === "top" || side === "bottom"
}

function opposite(side) {
  return { top: "bottom", bottom: "top", left: "right", right: "left" }[side]
}

function title(side) {
  return side.charAt(0).toUpperCase() + side.slice(1)
}

// Stored entries may be partial or hand-edited; everything reads through this.
function normalize(raw) {
  var entry = raw || {}
  var result = {
    enabled: entry.enabled !== false,
    fill: FILLS.indexOf(entry.fill) !== -1 ? entry.fill : "black",
    clockEdge: CLOCK_EDGES.indexOf(entry.clockEdge) !== -1 ? entry.clockEdge : "largest",
    clockHours: CLOCK_HOURS.indexOf(entry.clockHours) !== -1 ? entry.clockHours : 24,
    clockDate: entry.clockDate === true,
    clockSeconds: CLOCK_SECONDS.indexOf(entry.clockSeconds) !== -1 ? entry.clockSeconds : "off",
    dim: dimPercent(entry.dim),
    panels: panelList(entry.panels)
  }
  for (var i = 0; i < EDGES.length; i++) result[EDGES[i]] = pixels(entry[EDGES[i]])
  return result
}

// The stats panels an entry shows, in its order: known names, once each,
// retired ones as the panel that took them over. Anything but a list (a
// missing key) is the default; an empty list is a dashboard with nothing
// on it.
function panelList(raw) {
  if (!Array.isArray(raw)) return STATS_DEFAULT.slice()
  var result = []
  raw.forEach(function(name) {
    var panel = RETIRED_PANELS.hasOwnProperty(name) ? RETIRED_PANELS[name] : name
    if (STATS_PANELS.indexOf(panel) !== -1 && result.indexOf(panel) === -1) result.push(panel)
  })
  return result
}

// `list` with `panel` switched on or off: flipped, or set to `on` when it
// is given. A panel switched on goes last.
function togglePanel(list, panel, on) {
  if (STATS_PANELS.indexOf(panel) === -1) return panelList(list)
  var has = list.indexOf(panel) !== -1
  if (on === undefined) on = !has
  return panelList(on ? list.concat([panel]) : list.filter(function(name) { return name !== panel }))
}

// `list` with `panel` moved `delta` places towards the end (negative:
// towards the start), within the list; unchanged for a panel not in it.
function movePanel(list, panel, delta) {
  var result = panelList(list)
  var from = result.indexOf(panel)
  if (from === -1) return result
  var to = clamp(from + delta, 0, result.length - 1)
  result.splice(from, 1)
  result.splice(to, 0, panel)
  return result
}

// Every panel in the order the panel's list shows them: the ones `list`
// shows first, in its order, then the rest in STATS_PANELS order.
function panelOrder(list) {
  var shown = panelList(list)
  return shown.concat(STATS_PANELS.filter(function(panel) { return shown.indexOf(panel) === -1 }))
}

// The panel a name stands for, by key, label or alias in any case; "" for
// an unknown name.
function panelFrom(text) {
  text = String(text).trim().toLowerCase()
  if (PANEL_ALIASES[text]) return PANEL_ALIASES[text]
  for (var i = 0; i < STATS_PANELS.length; i++)
    if (text === STATS_PANELS[i] || text === PANEL_NAMES[STATS_PANELS[i]].toLowerCase()) return STATS_PANELS[i]
  return ""
}

// A comma list of panels from IPC, "all" or "none"; null when a name is
// unknown.
function panelsFrom(text) {
  text = String(text).trim().toLowerCase()
  if (text === "all") return STATS_PANELS.slice()
  if (text === "none" || text === "") return []
  var names = text.split(",").map(panelFrom)
  if (names.indexOf("") !== -1) return null
  return panelList(names)
}

// The panel's pages, in tab order, and their names.
var PAGES = ["edges", "fill", "stats", "profiles"]

var PAGE_NAMES = { edges: "Edges", fill: "Fill", stats: "Stats", profiles: "Profiles" }

// The page `direction` steps from `page` (1 next, -1 previous), wrapping
// around; the first page for one that is not a page.
function nextPage(page, direction) {
  var index = PAGES.indexOf(page)
  if (index === -1) return PAGES[0]
  return PAGES[(index + direction + PAGES.length) % PAGES.length]
}

// How many cells share the row of cell `index` in a grid of `count` cells,
// `columns` to a row: the last row's few stretch across, leaving no gap.
function rowCells(count, columns, index) {
  var lastRow = Math.floor((count - 1) / columns) * columns
  return index >= lastRow ? count - lastRow : columns
}

// The row lengths of `count` cells laid out `columns` to a row, the last
// row taking the rest: what gridMove walks for one such grid.
function gridRows(count, columns) {
  var rows = []
  for (var left = count; left > 0; left -= columns) rows.push(Math.min(columns, left))
  return rows
}

// Where the keyboard cursor goes after a button acted: back onto the
// button it was on, found by `key` among the page's `keys` now, since what
// it did may have added or taken away buttons before it; else onto
// `fallback` (an added stats panel's place among those shown); else the
// same place, kept on the page. -1 on a page with no buttons.
function cursorAfter(keys, key, index, fallback) {
  if (!keys.length) return -1
  var found = keys.indexOf(key)
  if (found === -1 && fallback) found = keys.indexOf(fallback)
  return found !== -1 ? found : clamp(index, 0, keys.length - 1)
}

// Where the keyboard cursor goes from cell `index` of a page whose cells
// run in rows of `rows[i]` cells, `dx` cells along a row or `dy` rows up
// or down. Along a row it stops at the ends; between rows it lands on the
// cell under the middle of the one it left, since rows differ in length
// and stretch across. Off the grid (-1, or past the end after cells went
// away) it starts from the first cell or the last.
function gridMove(rows, index, dx, dy) {
  var total = rows.reduce(function(sum, length) { return sum + length }, 0)
  if (total === 0) return -1
  if (index < 0) return 0
  if (index >= total) return total - 1
  var row = 0, start = 0
  while (index >= start + rows[row]) start += rows[row++]
  var column = index - start
  if (dx) return start + clamp(column + dx, 0, rows[row] - 1)
  var target = clamp(row + dy, 0, rows.length - 1)
  if (target === row) return index
  var middle = (column + 0.5) / rows[row]
  var targetStart = 0
  for (var i = 0; i < target; i++) targetStart += rows[i]
  return targetStart + Math.min(rows[target] - 1, Math.floor(middle * rows[target]))
}

function panelName(panel) {
  return PANEL_NAMES[panel] || title(String(panel))
}

// What is actually on screen: a paused output reserves nothing.
function active(raw) {
  var entry = normalize(raw)
  if (!entry.enabled) for (var i = 0; i < EDGES.length; i++) entry[EDGES[i]] = 0
  return entry
}

// Whether two normalized entries reserve, enable and fill the same.
function same(a, b) {
  if (a.enabled !== b.enabled || a.fill !== b.fill || a.clockEdge !== b.clockEdge || a.dim !== b.dim) return false
  if (a.clockHours !== b.clockHours || a.clockDate !== b.clockDate || a.clockSeconds !== b.clockSeconds) return false
  if (String(a.panels) !== String(b.panels)) return false
  for (var i = 0; i < EDGES.length; i++) if (a[EDGES[i]] !== b[EDGES[i]]) return false
  return true
}

function total(entry) {
  var sum = 0
  for (var i = 0; i < EDGES.length; i++) sum += entry[EDGES[i]] || 0
  return sum
}

function summary(entry) {
  var parts = []
  for (var i = 0; i < EDGES.length; i++)
    if (entry[EDGES[i]] > 0) parts.push(title(EDGES[i]) + " " + entry[EDGES[i]] + " px")
  if (!parts.length) return "No reserved edges"
  if (entry.fill && entry.fill !== "black") parts.push(fillName(entry.fill))
  return (entry.enabled === false ? "Paused  ·  " : "") + parts.join("  ·  ")
}

// The panel subtitle's form of `summary`: no units and no fill (the Fill
// grid shows it), and initials once more than two edges would not fit.
function shortSummary(entry) {
  var reserved = EDGES.filter(function(edge) { return entry[edge] > 0 })
  if (!reserved.length) return "No reserved edges"
  var parts = reserved.map(function(edge) {
    return (reserved.length > 2 ? title(edge).charAt(0) : title(edge)) + " " + entry[edge]
  })
  return (entry.enabled === false ? "Paused  ·  " : "") + parts.join("  ·  ")
}

function nextFill(fill) {
  return FILLS[(FILLS.indexOf(fill) + 1) % FILLS.length]
}

// The fill a name stands for, by key or label in any case ("Dimmed" is
// "dim"); "" for an unknown name.
function fillFrom(text) {
  text = String(text).toLowerCase()
  for (var i = 0; i < FILLS.length; i++)
    if (text === FILLS[i] || text === FILL_NAMES[FILLS[i]].toLowerCase()) return FILLS[i]
  return ""
}

function fillName(fill) {
  return FILL_NAMES[fill] || title(String(fill))
}

// Whether a fill draws the wallpaper, so its path has to be kept current.
function showsWallpaper(fill) {
  return fill === "wallpaper" || fill === "dim"
}

// The largest reserved edge among `sides`, the first on a tie. "" when none
// is reserved.
function largestEdge(entry, sides) {
  var best = ""
  for (var i = 0; i < sides.length; i++)
    if (entry[sides[i]] > 0 && (!best || entry[sides[i]] > entry[best])) best = sides[i]
  return best
}

// The one edge that shows the clock, following the entry's clockEdge: the
// largest edge, or the larger of top and bottom while either is reserved.
function clockEdge(entry) {
  return (entry.clockEdge === "topBottom" && largestEdge(entry, ["top", "bottom"])) || largestEdge(entry, EDGES)
}

// What `side` of a normalized entry shows. There is one clock (or stats
// dashboard) per monitor; its other edges stay black.
function edgeFill(entry, side) {
  return SINGLE_FILLS.indexOf(entry.fill) !== -1 && side !== clockEdge(entry) ? "black" : entry.fill
}

// The size of the strip the stats fill draws on, for a monitor of
// `width` by `height` showing `entry` (fitted): the reserved edge it goes
// on, across the monitor. Null without the stats fill or that edge.
function statsStrip(entry, width, height) {
  if (entry.fill !== "stats") return null
  var side = clockEdge(entry)
  if (!side || !(entry[side] > 0)) return null
  return isHorizontal(side) ? { width: width, height: entry[side] } : { width: entry[side], height: height }
}

// What an edge shows beside a fullscreen window: black, except the stats
// dashboard, which is most useful while a game runs.
function fullscreenFill(fill) {
  return fill === "stats" ? "stats" : "black"
}

// Fullscreen windows on a monitor with a reserve, from `hyprctl -j clients`,
// are fitted to the reachable area: maximized for Hyprland, which keeps
// them inside the reserve, and still fullscreen for the app (state 1 2),
// the way a browser's fullscreen fills only its window. `fitted` lists the
// windows fitted so far: one that goes fullscreen again leaves fullscreen
// instead of being fitted again. That covers Super+F on it, and the app
// leaving fullscreen too, which Hyprland passes through full fullscreen.
function fullscreenChanges(clients, reservedMonitors, fitted) {
  var changes = [], next = []
  for (var i = 0; i < clients.length; i++) {
    var client = clients[i]
    var wasFitted = fitted.indexOf(client.address) >= 0
    if (client.fullscreen === 2 && reservedMonitors.indexOf(client.monitor) >= 0) {
      changes.push({ address: client.address, internal: wasFitted ? 0 : 1, client: wasFitted ? 0 : 2 })
      if (!wasFitted) next.push(client.address)
    } else if (wasFitted && client.fullscreen === 1 && client.fullscreenClient === 2) {
      next.push(client.address)
    }
  }
  return { changes: changes, fitted: next }
}

// Seconds of inactivity before every edge goes black, the panel's choices;
// 0 never does. Any other whole number of seconds from a hand edit works too.
var IDLE_TIMEOUTS = [0, 30, 60, 300]

function idleSeconds(value) {
  return pixels(value)
}

function nextIdle(seconds) {
  var index = IDLE_TIMEOUTS.indexOf(idleSeconds(seconds))
  return IDLE_TIMEOUTS[(index + 1) % IDLE_TIMEOUTS.length]
}

function idleName(seconds) {
  seconds = idleSeconds(seconds)
  if (!seconds) return "Off"
  return seconds % 60 === 0 ? seconds / 60 + " min" : seconds + " s"
}

// Frames a second the stats fill's graphs and meters move at, the panel's
// choices: 0 follows each monitor's refresh rate, 1 drops the animation and
// moves everything once a second, with each new sample. Any whole number
// up to 240 from a hand edit works too.
var STATS_PACES = [0, 60, 30, 15, 1]

var STATS_PACE = 30

function statsPace(value) {
  var n = Number(value)
  return value !== null && value !== "" && Math.floor(n) === n && n >= 0 && n <= 240 ? n : STATS_PACE
}

// The clockSeconds after `mode`, for the panel's button that cycles them.
function nextClockSeconds(mode) {
  var index = CLOCK_SECONDS.indexOf(mode)
  return CLOCK_SECONDS[(index + 1) % CLOCK_SECONDS.length]
}

function nextPace(pace) {
  var index = STATS_PACES.indexOf(statsPace(pace))
  return STATS_PACES[(index + 1) % STATS_PACES.length]
}

// paceName cut to fit one of five buttons in a row.
function paceShort(pace) {
  pace = statsPace(pace)
  if (pace === 0) return "Display"
  if (pace === 1) return "Off"
  return String(pace)
}

function paceName(pace) {
  pace = statsPace(pace)
  if (pace === 0) return "Display rate"
  if (pace === 1) return "No animation"
  return pace + " fps"
}
