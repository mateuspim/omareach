.pragma library

// How the stats fill shows numbers, without any QML: the theme's
// palette, heat levels and the text forms of sizes, rates and times.

// The #rrggbb colors of an Omarchy colors.toml by name, lowercase.
function parseColors(text) {
  var colors = {}
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var match = /^\s*([A-Za-z0-9_-]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})\b/.exec(lines[i])
    if (match) colors[match[1]] = match[2].toLowerCase()
  }
  return colors
}

// The dashboard's colors from the theme's colors.toml, built the way
// Omarchy's btop themes are: each box has its own hue and graphs run
// through three. Names missing from the theme fall back to the numbered
// terminal colors, then to `fallback` (the shell's own foreground, accent
// and so on).
function palette(colors, fallback) {
  colors = colors || {}
  fallback = fallback || {}
  var foreground = colors.foreground || colors.color7 || fallback.foreground || "#cccccc"
  var background = colors.background || colors.color0 || fallback.background || "#000000"
  var accent = colors.accent || colors.color4 || fallback.accent || foreground
  var muted = colors.muted || colors.color8 || fallback.muted || mix(foreground, background, 0.5)
  function named(name, number, extra) { return colors[name] || colors[number] || extra || accent }
  var red = named("red", "color1", fallback.urgent)
  var green = named("green", "color2")
  var yellow = named("yellow", "color3")
  var blue = named("blue", "color4")
  var magenta = named("magenta", "color5")
  var cyan = named("cyan", "color6")
  var orange = colors.orange || yellow
  return {
    foreground: foreground,
    background: background,
    accent: accent,
    line: muted,
    subtle: mix(foreground, background, 0.35),
    // The dashboard sits on black, so its tracks are mixed from black too.
    meter: mix("#000000", foreground, 0.13),
    // A card's border and title when something on it needs attention: a
    // caution first, then the alarm. No box uses either as its own hue,
    // so a warning never looks like a card's normal color.
    caution: yellow,
    alert: red,
    boxes: { gpu: cyan, igpu: mix(cyan, green, 0.5), temps: mix(yellow, red, 0.5), battery: green, media: mix(magenta, blue, 0.5), system: accent, cpu: magenta, memory: green, network: mix(cyan, blue, 0.5), disks: mix(yellow, green, 0.35), processes: blue },
    // Headlines and graphs run through their box's hues, cool to hot, as
    // in btop. Every meter that measures how close something is to its
    // limit (heat, power, VRAM, swap, load, stalls, fans, battery) uses
    // `level`, so the same color means the same thing on every card.
    gradients: {
      cpu: [cyan, blue, magenta],
      // Green through the first half: yellow and red mean close.
      level: [green, green, yellow, red],
      used: [green, cyan, blue],
      download: [yellow, orange, red],
      upload: [green, cyan, blue],
      process: [cyan, blue, magenta]
    }
  }
}

function channels(hex) {
  var n = parseInt(String(hex).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// `a` moved towards `b` by `t` (0 to 1).
function mix(a, b, t) {
  var x = channels(a), y = channels(b)
  return "#" + x.map(function(c, i) {
    return ("0" + Math.round(c + (y[i] - c) * t).toString(16)).slice(-2)
  }).join("")
}

// The color at `fraction` (0 to 1) along evenly spaced `stops`.
function gradientAt(stops, fraction) {
  var t = Math.max(0, Math.min(1, Number(fraction) || 0)) * (stops.length - 1)
  var i = Math.min(Math.floor(t), stops.length - 2)
  return mix(stops[i], stops[i + 1], t - i)
}

// The temperature a heat meter starts from: a part at room temperature
// shows an empty meter.
var HEAT_FLOOR = 30

// How close `temp` is to `limit`, 0 to 1, from HEAT_FLOOR up: a CPU at
// 69 °C of 95 is most of the way to throttling, which a 0 to 100 °C scale
// would show as barely past half.
function heat(temp, limit) {
  if (temp === null || temp === undefined) return 0
  limit = limit > HEAT_FLOOR ? limit : 100
  return Math.max(0, Math.min(1, (temp - HEAT_FLOOR) / (limit - HEAT_FLOOR)))
}

// CPU numbers from a sysfs list like "0-15,20": [0, 1, ..., 15, 20].
function cpuList(text) {
  var result = []
  String(text || "").split(",").forEach(function(part) {
    var range = /^\s*(\d+)(?:-(\d+))?\s*$/.exec(part)
    if (!range) return
    for (var n = Number(range[1]); n <= Number(range[2] || range[1]); n++) result.push(n)
  })
  return result
}

// A hybrid CPU's threads by kind, from @sysinfo's cpu_core and cpu_atom
// (Intel's performance and efficient cores): { performance: [cpu numbers],
// efficient: [...] }, or null for a CPU with one kind of core.
function coreGroups(sysinfo) {
  var info = sysinfo || {}
  var performance = cpuList(info.cpu_core), efficient = cpuList(info.cpu_atom)
  return performance.length && efficient.length ? { performance: performance, efficient: efficient } : null
}

var UNITS = ["B", "KiB", "MiB", "GiB", "TiB"]

function scaled(bytes) {
  var value = Math.max(0, Number(bytes) || 0), unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit++ }
  return { value: value, unit: unit }
}

function number(value, unit) {
  return unit === 0 ? String(Math.round(value)) : value < 100 ? value.toFixed(1) : String(Math.round(value))
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—"
  var s = scaled(bytes)
  return number(s.value, s.unit) + " " + UNITS[s.unit]
}

// "7.4 / 16.0 GiB": both in the unit of the total.
function formatPair(used, total) {
  var s = scaled(total)
  var factor = Math.pow(1024, s.unit)
  return number(used / factor, s.unit) + " / " + number(s.value, s.unit) + " " + UNITS[s.unit]
}

function formatRate(bytes) {
  return bytes === null || bytes === undefined ? "—" : formatBytes(bytes) + "/s"
}

// A byte count in a few characters, for rows with several of them: "936K".
function formatShort(bytes) {
  if (bytes === null || bytes === undefined) return "—"
  var s = scaled(bytes)
  return number(s.value, s.unit) + (s.unit ? UNITS[s.unit].charAt(0) : "")
}

// A track position: "1:23", or "1:02:03" past an hour.
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return "—"
  seconds = Math.max(0, Math.floor(seconds))
  var h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60
  return (h ? h + ":" + ("0" + m).slice(-2) : String(m)) + ":" + ("0" + s).slice(-2)
}

// A long stretch in its two largest units: "2d 7h", "9h 50m", "5m".
function formatUptime(seconds) {
  var minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24)
  if (days) return days + "d " + hours % 24 + "h"
  if (hours) return hours + "h " + minutes % 60 + "m"
  return minutes + "m"
}

function formatPercent(value) {
  return value === null || value === undefined ? "—" : Math.round(value) + "%"
}

function formatTemp(value) {
  return value === null || value === undefined ? "—" : Math.round(value) + "°C"
}

function formatFrequency(mhz) {
  if (mhz === null || mhz === undefined) return "—"
  return mhz >= 1000 ? (mhz / 1000).toFixed(2) + " GHz" : Math.round(mhz) + " MHz"
}
