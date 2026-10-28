.pragma library

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

// Blocky 3x5 digits in the style of clock-tui, one string per row.
var GLYPHS = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": ["##.", ".#.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  ":": [".", "#", ".", "#", "."]
}

// The most lit cells any HH:MM can have, so the clock can keep one set of
// blocks and move them each minute instead of making new ones.
var CLOCK_CELLS = (function() {
  var most = 0
  for (var digit in GLYPHS) {
    if (digit === ":") continue
    most = Math.max(most, GLYPHS[digit].join("").split("#").length - 1)
  }
  return 4 * most + GLYPHS[":"].join("").split("#").length - 1
})()

// HH:MM in 24-hour time, or H:MM in 12-hour time (`hours` 12), where a
// leading zero would only read as a 24-hour clock.
function clockText(date, hours) {
  var minutes = ":" + ("0" + date.getMinutes()).slice(-2)
  if (hours === 12) return String(date.getHours() % 12 || 12) + minutes
  return ("0" + date.getHours()).slice(-2) + minutes
}

// The lit cells of `lines` (a string or an array of them) in GLYPHS, with
// one blank cell between glyphs and between lines, each line centered, as
// { columns, rows, cells: [{ x, y }] }. Unknown characters are skipped.
function clockBitmap(lines) {
  lines = [].concat(lines)
  var widths = lines.map(function(line) {
    var width = 0
    for (var i = 0; i < line.length; i++) {
      var glyph = GLYPHS[line.charAt(i)]
      if (glyph) width += (width > 0 ? 1 : 0) + glyph[0].length
    }
    return width
  })
  var columns = Math.max.apply(null, widths)
  var cells = []
  for (var n = 0; n < lines.length; n++) {
    var x = Math.floor((columns - widths[n]) / 2)
    var top = n * 6
    for (var i = 0; i < lines[n].length; i++) {
      var glyph = GLYPHS[lines[n].charAt(i)]
      if (!glyph) continue
      for (var row = 0; row < glyph.length; row++)
        for (var column = 0; column < glyph[row].length; column++)
          if (glyph[row].charAt(column) === "#") cells.push({ x: x + column, y: top + row, colon: lines[n].charAt(i) === ":" })
      x += glyph[0].length + 1
    }
  }
  return { columns: columns, rows: lines.length * 6 - 1, cells: cells }
}

// The clock for a strip of `width` by `height`, always upright: HH:MM on one
// line, or HH over MM when that gives bigger blocks, as on a side edge.
// `cell` is the block size, leaving a block of margin all round; whole
// pixels once they are 2 or more. `spanColumns` by `spanRows` is all it
// takes, in blocks.
//
// With `dated`, a line of date goes with the time where there is room:
// under it (DATE_ROWS rows: a blank one and three of text) or, on a short
// wide strip whose height limits the time, beside it (a gap of DATE_GAP
// and DATE_COLUMNS columns), whichever keeps the bigger clock. `date` is
// "under", "beside", or "" where neither keeps DATE_KEEP of the time's
// size; `dateBox` is where its text goes, in blocks.
var DATE_ROWS = 4
var DATE_GAP = 2
// "Sat 24 Oct" at three blocks high; a longer name shrinks to fit.
var DATE_COLUMNS = 15
var DATE_KEEP = 0.7
function clockLayout(text, width, height, dated) {
  // Sized for the widest time, so a 12-hour clock keeps its size and its
  // shape through the day: "1:05" is narrower than "12:59", and sized on
  // its own it grew at 1:00 and shrank at 10:00. The digits showing are
  // centered in the room the widest would take.
  var room = bestClock("00:00", width, height, dated ? datePlace(width, height) : "")
  var parts = String(text).split(":")
  var shown = clockBitmap(room.rows > 5 ? parts : text)
  var left = Math.floor((room.columns - shown.columns) / 2)
  room.cells = shown.cells.map(function(c) { return { x: c.x + left, y: c.y } })
  return room
}

// Where the date goes on a strip, decided for the widest time rather than
// the one showing: "1:05" is narrower than "12:59", and the date must not
// come and go as the hours change.
function datePlace(width, height) {
  var plain = bestClock("00:00", width, height, "")
  var under = bestClock("00:00", width, height, "under")
  var beside = bestClock("00:00", width, height, "beside")
  var best = beside.cell > under.cell ? beside : under
  return best.cell >= plain.cell * DATE_KEEP ? best.date : ""
}

function bestClock(text, width, height, date) {
  var parts = String(text).split(":")
  var best = null
  var options = [clockBitmap(text), clockBitmap(parts)]
  for (var i = 0; i < options.length; i++) {
    var option = options[i]
    option.date = date
    option.spanColumns = option.columns + (date === "beside" ? DATE_GAP + DATE_COLUMNS : 0)
    option.spanRows = option.rows + (date === "under" ? DATE_ROWS : 0)
    option.dateBox = date === "under" ? { x: 0, y: option.rows + 1, width: option.columns, height: DATE_ROWS - 1 }
      : date === "beside" ? { x: option.columns + DATE_GAP, y: (option.rows - 3) / 2, width: DATE_COLUMNS, height: 3 }
      : null
    option.cell = Math.max(0, Math.min(width / (option.spanColumns + 2), height / (option.spanRows + 2)))
    if (!best || option.cell > best.cell) best = option
  }
  if (best.cell >= 2) best.cell = Math.floor(best.cell)
  return best
}

// Where the clock sits, in steps from the middle of the strip. It moves one
// step every 5 minutes around a 3x3 square so no pixel stays lit for long.
var SHIFTS = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
function clockShift(date) {
  var step = SHIFTS[Math.floor((date.getHours() * 60 + date.getMinutes()) / 5) % SHIFTS.length]
  return { x: step[0], y: step[1] }
}

// How far one clockShift step moves the logo: a fiftieth of its smaller
// side, at least a pixel, so it spreads the wear without looking off-center.
function logoStep(width, height) {
  return Math.max(1, Math.round(Math.min(width, height) / 50))
}

// Milliseconds until the next minute starts, for a clock that ticks on it.
function untilNextMinute(date) {
  return 60000 - date.getSeconds() * 1000 - date.getMilliseconds()
}

// The clockSeconds after `mode`, for the panel's button that cycles them.
function nextClockSeconds(mode) {
  var index = CLOCK_SECONDS.indexOf(mode)
  return CLOCK_SECONDS[(index + 1) % CLOCK_SECONDS.length]
}

// Milliseconds until the next second starts, for a clock with seconds.
function untilNextSecond(date) {
  return 1000 - date.getMilliseconds()
}

// Whether a blinking colon (clockSeconds "blink") is lit: every other
// second, on the even ones, so it is lit as each minute turns.
function colonLit(date) {
  return date.getSeconds() % 2 === 0
}

// How full the seconds bar (clockSeconds "bar") is: empty as the minute
// turns, a sixtieth more each second.
function secondsFraction(date) {
  return date.getSeconds() / 60
}

// Milliseconds until clockShift next moves, for the logo, which has no
// reason to wake up every minute.
function untilNextShift(date) {
  return untilNextMinute(date) + (4 - date.getMinutes() % 5) * 60000
}

// Width over height of an SVG, from its viewBox or else its width and
// height attributes; `fallback` when it has neither.
function svgAspect(svg, fallback) {
  var box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg || "")
  if (box && Number(box[2]) > 0) return Number(box[1]) / Number(box[2])
  var width = /\swidth="([\d.]+)"/.exec(svg || "")
  var height = /\sheight="([\d.]+)"/.exec(svg || "")
  if (width && height && Number(height[1]) > 0) return Number(width[1]) / Number(height[1])
  return fallback
}

// Repaints a black SVG in `color` (#rrggbb).
function recolorSvg(svg, color) {
  return String(svg || "").replace(/fill="(#000|#000000|black)"/gi, 'fill="' + color + '"')
}

// #rrggbb for channels in 0..1, as a QML color exposes them.
function hexColor(r, g, b) {
  return "#" + [r, g, b].map(function(channel) {
    return ("0" + Math.round(clamp(channel, 0, 1) * 255).toString(16)).slice(-2)
  }).join("")
}

// The lit cells of block art such as Omarchy's icon.txt, where two
// characters make one square cell, as { columns, rows, cells: [{ x, y }] }.
function blockBitmap(text) {
  var lines = String(text || "").split("\n").filter(function(line) { return line.trim() !== "" })
  var cells = []
  var columns = 0
  for (var y = 0; y < lines.length; y++) {
    columns = Math.max(columns, Math.ceil(lines[y].length / 2))
    for (var x = 0; x * 2 < lines[y].length; x++)
      if (lines[y].charAt(x * 2) === "\u2588") cells.push({ x: x, y: y })
  }
  return { columns: columns, rows: lines.length, cells: cells }
}

// How the logo fits a strip of `width` by `height`, always upright: the
// wordmark alone, or with `stacked` (the side edges) Omarchy's icon over the
// wordmark. `aspect` is the wordmark's width over height and `icon` the
// icon's blockBitmap; without one the wordmark stands alone. Returns
// { stacked, width, cell, gap }: `width` is the wordmark's (and the icon's)
// width and `cell` the icon's block size.
function logoLayout(width, height, aspect, icon, stacked) {
  if (!stacked || !icon || !icon.columns || !icon.rows)
    return { stacked: false, width: Math.max(0, Math.min(width * 0.5, height * 0.4 * aspect)), cell: 0, gap: 0 }
  var cell = Math.max(0, Math.min(width * 0.7, height * 0.8 / (icon.rows / icon.columns + 0.15 + 1 / aspect))) / icon.columns
  if (cell >= 2) cell = Math.floor(cell)
  return { stacked: true, width: cell * icon.columns, cell: cell, gap: Math.round(cell * icon.columns * 0.15) }
}

// Where a full-screen image sits inside the strip for `side`, so the strip
// shows exactly the slice of it that is on screen there.
function imageOffset(side, pixels, width, height) {
  return {
    x: side === "right" ? pixels - width : 0,
    y: side === "bottom" ? pixels - height : 0
  }
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

// Aspect presets: the reachable area's width over height. `start` puts the
// reachable area at the top or left, `end` at the bottom or right.
var ASPECTS = ["21:9", "16:9", "4:3", "1:1"]
var ALIGNS = ["start", "center", "end"]

// "16:9", "16/9" or "1.78" as a number; 0 when it is not a positive ratio.
function parseAspect(text) {
  var parts = String(text).split(/[:\/x]/)
  var value = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(text)
  return isFinite(value) && value > 0 ? value : 0
}

// "top" and "left" mean start, "bottom" and "right" end; "" for anything
// that is not an alignment.
function alignment(text) {
  text = String(text).toLowerCase()
  if (text === "start" || text === "top" || text === "left") return "start"
  if (text === "end" || text === "bottom" || text === "right") return "end"
  return text === "center" || text === "middle" ? "center" : ""
}

function nextAlign(align) {
  return ALIGNS[(ALIGNS.indexOf(align) + 1) % ALIGNS.length]
}

// The edges that leave a `width` by `height` screen a reachable area of
// `aspect`, placed by `align` along the axis that is cut. Only the pair of
// edges on that axis is reserved; center gives the odd pixel to the end.
function aspectEdges(width, height, aspect, align) {
  var edges = { top: 0, bottom: 0, left: 0, right: 0 }
  if (!(width > 0 && height > 0 && aspect > 0)) return edges
  var wide = width / height > aspect
  var cut = wide ? width - Math.round(height * aspect) : height - Math.round(width / aspect)
  var first = wide ? "left" : "top", second = wide ? "right" : "bottom"
  var before = align === "start" ? 0 : align === "end" ? cut : Math.floor(cut / 2)
  edges[first] = before
  edges[second] = cut - before
  return fit(edges, width, height)
}

// Where the reserved edges put the reachable area along the screen's long
// axis, for an alignment control that starts from what is on screen.
function inferAlign(entry, width, height) {
  var vertical = height > width
  var before = vertical ? entry.top : entry.left
  var after = vertical ? entry.bottom : entry.right
  return before === after ? "center" : before > after ? "end" : "start"
}

// The name of the reachable area's place for `align` on a screen of this
// shape: portrait screens are cut top and bottom, landscape ones mostly on
// the sides.
function alignName(align, width, height) {
  var vertical = height > width
  if (align === "start") return vertical ? "Top" : "Left"
  if (align === "end") return vertical ? "Bottom" : "Right"
  return "Center"
}

// The preset in ASPECTS whose edges `entry` reserves exactly for `align`,
// or "" when none does.
function matchingAspect(entry, width, height, align) {
  for (var i = 0; i < ASPECTS.length; i++) {
    var edges = aspectEdges(width, height, parseAspect(ASPECTS[i]), align)
    if (EDGES.every(function(edge) { return edges[edge] === entry[edge] })) return ASPECTS[i]
  }
  return ""
}

// The marks of a ruler running `length` pixels in from a screen edge: a
// tick every 10 px, a longer one every 50 and a labelled one every 100.
function rulerTicks(length) {
  var ticks = []
  for (var at = 10; at <= length; at += 10)
    ticks.push({ at: at, size: at % 100 === 0 ? 3 : at % 50 === 0 ? 2 : 1, label: at % 100 === 0 ? String(at) : "" })
  return ticks
}

// Never let a typo swallow the whole monitor: a tenth of each axis stays
// usable, so the bar and the panel remain reachable. Opposite edges share
// that budget, so `oppositePixels` comes off the limit.
function limit(side, width, height, oppositePixels) {
  var size = isHorizontal(side) ? height : width
  if (!(size > 0)) return 4000
  return Math.max(0, Math.floor(size * 0.9) - pixels(oppositePixels))
}

// Applies the same budget to a whole entry, for values that never went
// through the panel: hand edits, or a monitor that changed to a smaller mode.
// The first edge of each pair keeps what it can and the second gets the rest.
function fit(entry, width, height) {
  var result = Object.assign({}, entry)
  var pairs = [["top", "bottom"], ["left", "right"]]
  for (var i = 0; i < pairs.length; i++) {
    var first = pairs[i][0], second = pairs[i][1]
    result[first] = Math.min(pixels(result[first]), limit(first, width, height, 0))
    result[second] = Math.min(pixels(result[second]), limit(second, width, height, result[first]))
  }
  return result
}

function snap(value, grid) {
  return grid > 1 ? Math.round(value / grid) * grid : Math.round(value)
}

// Converts a drag in the monitor preview into a reservation for `side`:
// the value at press time plus the pointer's travel towards the middle.
// `scale` is preview pixels per screen pixel.
function fromDrag(side, start, dx, dy, scale, grid, max) {
  if (!(scale > 0)) return clamp(pixels(start), 0, max)
  var inward = side === "top" ? dy
    : side === "bottom" ? -dy
    : side === "left" ? dx
    : -dx
  return clamp(snap(pixels(start) + inward / scale, grid), 0, max)
}

function nudge(value, delta, max) {
  return clamp(pixels(value) + delta, 0, max)
}

// Whole wheel notches (120 units each) in `rest`, which accumulates
// angleDelta; touchpads send many small deltas that add up to one notch.
function notches(rest) {
  return rest < 0 ? Math.ceil(rest / 120) : Math.floor(rest / 120)
}

// Storage key per connector name. Connector names such as DP-4 can swap
// between boots behind a dock, so a monitor is keyed by its description
// (make, model and serial) when that is known and unique among the connected
// monitors, and by its connector name otherwise. `monitors` holds
// { name, description } pairs.
function outputKeys(monitors) {
  var counts = {}
  var keys = {}
  var i, description
  for (i = 0; i < monitors.length; i++) {
    description = String(monitors[i].description || "").trim()
    if (description) counts[description] = (counts[description] || 0) + 1
  }
  for (i = 0; i < monitors.length; i++) {
    var name = String(monitors[i].name || "")
    description = String(monitors[i].description || "").trim()
    if (name) keys[name] = description && counts[description] === 1 ? description : name
  }
  return keys
}

// Profiles: named snapshots of every saved monitor's entry ("Desk",
// "Gaming"). Applying one makes the saved entries exactly what it holds.

// A profile name as typed: trimmed, at most 32 characters; "" is no name.
function profileName(text) {
  return String(text || "").trim().replace(/\s+/g, " ").slice(0, 32)
}

// Whether an entry says anything: a monitor without one is left out of a
// snapshot, as it would be missing from `outputs`.
function isDefault(entry) {
  return same(normalize(entry), normalize(null))
}

// The entries in `outputs` worth keeping, normalized, as a profile holds
// them.
function snapshot(outputs) {
  var result = {}
  for (var key in outputs || {}) if (!isDefault(outputs[key])) result[key] = normalize(outputs[key])
  return result
}

// Whether two maps of entries reserve, enable and fill the same, a missing
// entry counting as the default one.
function sameOutputs(a, b) {
  a = a || {}
  b = b || {}
  var keys = Object.keys(a).concat(Object.keys(b))
  for (var i = 0; i < keys.length; i++)
    if (!same(normalize(a[keys[i]]), normalize(b[keys[i]]))) return false
  return true
}

// Profiles read from the state file: valid names with an object of
// entries, anything else dropped.
function profiles(raw) {
  var result = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result
  for (var name in raw) {
    var clean = profileName(name)
    if (clean && raw[name] && typeof raw[name] === "object" && !Array.isArray(raw[name]))
      result[clean] = snapshot(raw[name])
  }
  return result
}

// Profile names in the order the panel lists them.
function profileNames(profiles) {
  return Object.keys(profiles || {}).sort(function(a, b) { return a.localeCompare(b) })
}

// The profile `outputs` matches, or "" when none does (or no profile
// exists). Several profiles can hold the same thing; `preferred`, the one
// last applied or saved, wins while it still matches, and otherwise the
// first by name.
function currentProfile(profiles, outputs, preferred) {
  if (preferred && profiles && profiles[preferred] !== undefined && sameOutputs(profiles[preferred], outputs)) return preferred
  var names = profileNames(profiles)
  for (var i = 0; i < names.length; i++) if (sameOutputs(profiles[names[i]], outputs)) return names[i]
  return ""
}

// The profile `text` names, by exact name or else ignoring case; "" when
// none does.
function findProfile(profiles, text) {
  var name = profileName(text)
  if (!name) return ""
  if (profiles && profiles[name] !== undefined) return name
  var names = profileNames(profiles)
  for (var i = 0; i < names.length; i++) if (names[i].toLowerCase() === name.toLowerCase()) return names[i]
  return ""
}

// Automatic profiles: a profile can be tied to a set of monitors (their
// storage keys) and is applied whenever exactly that set is connected.

// The storage keys of the connected monitors, from outputKeys, sorted.
function monitorSet(keys) {
  var set = []
  for (var name in keys || {}) if (set.indexOf(keys[name]) === -1) set.push(String(keys[name]))
  return set.sort()
}

function sameSet(a, b) {
  a = a || []
  b = b || []
  if (a.length !== b.length) return false
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) === -1) return false
  return true
}

// A set of monitor keys read from the state file: strings, sorted, each
// once; [] for anything else.
function keyList(raw) {
  if (!Array.isArray(raw)) return []
  var list = []
  for (var i = 0; i < raw.length; i++) {
    var key = String(raw[i] || "").trim()
    if (key && list.indexOf(key) === -1) list.push(key)
  }
  return list.sort()
}

// Automatic profiles read from the state file, as { name: [keys] }: only
// profiles that exist, with a set of at least one monitor.
function autoProfiles(raw, profiles) {
  var result = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result
  for (var name in raw) {
    var found = findProfile(profiles, name)
    var set = keyList(raw[name])
    if (found && set.length) result[found] = set
  }
  return result
}

// The automatic profile for this set of monitors, the first by name; ""
// when there is none.
function autoProfileFor(autos, set) {
  if (!set || !set.length) return ""
  var names = profileNames(autos)
  for (var i = 0; i < names.length; i++) if (sameSet(autos[names[i]], set)) return names[i]
  return ""
}
