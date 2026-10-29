.pragma library
.import "Model.js" as Model

// What the clock and logo fills draw, without any QML: digits and the logo
// as blocks, their layout on a strip and the shifts against burn-in.

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
    return ("0" + Math.round(Model.clamp(channel, 0, 1) * 255).toString(16)).slice(-2)
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
