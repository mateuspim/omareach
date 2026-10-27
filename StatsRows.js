.pragma library
.import "StatsFormat.js" as Format

// The rows the stats panels share, without any QML: labelled values,
// meters and their warning levels, tunnel tips, and how many rows fit
// under a card's headline.

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

// A mesh's row: its address when asked for, and how many of its peers
// are online, as far as either is known; "on" with neither.
function meshText(t) {
  var parts = []
  if (t.address) parts.push(t.address)
  if (t.peers) parts.push(t.online + "/" + t.peers + " online")
  return parts.join(" · ") || "on"
}

// Most peers a mesh's hover text lists before counting the rest.
var MESH_TIP_PEERS = 8

// The VPN row's hover text: each VPN, its interface and what its client
// adds (the server, the protocol).
function vpnTip(vpns) {
  return vpns.map(function(t) {
    return [t.place ? t.name + " · " + t.place : t.name].concat(t.details || [], [t.interface]).filter(function(line) { return line }).join("\n")
  }).join("\n\n")
}

// A mesh row's hover text, when its client said more (Tailscale): this
// machine's name and addresses, the exit node, then each peer, online
// ones first. Hovering is asking, so the addresses show whatever the
// Mesh addresses switch says.
function meshTip(t) {
  var status = t.status
  if (!status || !status.self) return t.interface
  var lines = [status.self.dns || status.self.name]
  if (status.self.ips.length) lines.push(status.self.ips.join("  "))
  if (status.exitNode) lines.push("Exit node: " + status.exitNode)
  if (status.nodes.length) lines.push("")
  status.nodes.slice(0, MESH_TIP_PEERS).forEach(function(node) {
    var about = [node.os, node.online ? node.link : "offline"].filter(function(part) { return part }).join(", ")
    lines.push((node.online ? "● " : "○ ") + node.name + (about ? "  " + about : ""))
  })
  if (status.nodes.length > MESH_TIP_PEERS) lines.push("and " + (status.nodes.length - MESH_TIP_PEERS) + " more")
  return lines.join("\n")
}

// A temperature row, its meter filling from HEAT_FLOOR to the sensor's
// limit, green through yellow to red like every level meter.
function heatRow(label, temp, limit, g) {
  var level = Format.heat(temp, limit)
  return row(label, Format.formatTemp(temp), level, Format.gradientAt(g.level, level))
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
  return row("Stalled", value.toFixed(1) + "%", level, Format.gradientAt(g.level, level))
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
  return row("Load", text, level, level === null ? "" : Format.gradientAt(g.level, level))
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

// Watts, with a decimal below 10: an iGPU draws fractions of one.
function watts(value) {
  return value < 10 ? value.toFixed(1) : String(Math.round(value))
}
