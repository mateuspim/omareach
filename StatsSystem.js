.pragma library

// The machine around the numbers, without any QML: sensors and their
// limits, its names, batteries, the media player and CPU power.

var CPU_CHIPS = ["k10temp", "zenpower", "coretemp", "k8temp", "cpu_thermal", "acpitz"]

var CPU_LABELS = ["Tctl", "Tdie", "Package id 0"]

// Temperature sensors on memory modules: DDR5 and DDR4.
var MEMORY_CHIPS = ["spd5118", "jc42"]

// The temperatures panel's name for a CPU sensor: the CPU itself, or one
// of its dies; null for per-core sensors, too many to list.
function cpuSensorName(label) {
  if (!label || CPU_LABELS.indexOf(label) !== -1) return "CPU"
  var die = /^Tccd(\d+)$/.exec(label)
  if (die) return "CCD " + die[1]
  return /^Core /.test(label) ? null : label
}

// The temperature, in °C, a sensor's meter fills towards when the chip
// gives no critical one: where these parts start to throttle. AMD's
// k10temp reports no limit, and Zen 2 to Zen 5 desktops throttle at 95;
// Intel's coretemp gives TjMax as its critical temperature, usually 100.
var TEMP_LIMITS = { k10temp: 95, zenpower: 95, k8temp: 95, coretemp: 100, cpu_thermal: 85, acpitz: 100, dimm: 85, nvme: 80, nvidia: 90, gpu: 100 }

// A sensor's limit: the critical temperature it reported (millidegrees,
// as text, "" for none), or the default for `kind`.
function tempLimit(crit, kind) {
  var value = Number(crit)
  return crit !== "" && crit !== undefined && value > 0 ? value / 1000 : TEMP_LIMITS[kind] || 100
}

// From stats.sh's hwmon lines (chip, sensor, label, value, critical) and
// nvme lines (controller, value, critical): the CPU temperature and its
// limit, every fan, the temperature of each NVMe controller with its
// limit, and `temps`, the CPU's and memory modules' sensors by name, each
// with its limit. Temperatures in °C.
function parseSensors(hwmon, nvme) {
  var result = { cpuTemp: null, cpuLimit: null, fans: [], nvme: {}, nvmeLimits: {}, temps: [] }
  var dimms = [], named = {}
  var fallback = null, fallbackLimit = null, rank = Infinity
  for (var i = 0; i < hwmon.length; i++) {
    var f = hwmon[i].split("\t")
    if (f.length < 4 || f[3] === "") continue
    var value = Number(f[3])
    if (/^fan/.test(f[1])) {
      result.fans.push({ name: f[2] || f[0] + " " + f[1], rpm: value })
    } else if (/^temp/.test(f[1]) && MEMORY_CHIPS.indexOf(f[0]) !== -1) {
      dimms.push({ name: "DIMM " + (dimms.length + 1), temp: value / 1000, limit: tempLimit(f[4], "dimm") })
    } else if (/^temp/.test(f[1]) && CPU_CHIPS.indexOf(f[0]) !== -1) {
      var limit = tempLimit(f[4], f[0])
      var sensorName = cpuSensorName(f[2])
      if (sensorName && !named[sensorName]) { named[sensorName] = true; result.temps.push({ name: sensorName, temp: value / 1000, limit: limit }) }
      var labelRank = CPU_LABELS.indexOf(f[2])
      if (labelRank !== -1 && labelRank < rank) { rank = labelRank; result.cpuTemp = value / 1000; result.cpuLimit = limit }
      if (fallback === null) { fallback = value / 1000; fallbackLimit = limit }
    }
  }
  if (result.cpuTemp === null) { result.cpuTemp = fallback; result.cpuLimit = fallbackLimit }
  result.temps = result.temps.concat(dimms)
  for (var j = 0; j < nvme.length; j++) {
    var g = nvme[j].split("\t")
    if (g.length < 2 || g[1] === "") continue
    result.nvme[g[0]] = Number(g[1]) / 1000
    result.nvmeLimits[g[0]] = tempLimit(g[2], "nvme")
  }
  return result
}

// stats.sh's @sysinfo lines (key, value): what fastfetch shows that seldom
// changes, read every minute.
function parseSysinfo(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f.length >= 2 && f[1] !== "") result[f[0]] = f[1]
  }
  return result
}

// Firmware's stand-ins for a name it was not given.
var PLACEHOLDER = /^(|system product name|to be filled by o\.?e\.?m\.?|default string|not applicable|none|0123456789)$/i

// The machine's name: the product's, or a desktop board's when the product
// has a stand-in.
function hostName(info) {
  var product = String(info.product_name || "").trim()
  if (!PLACEHOLDER.test(product)) return product
  return String(info.board_name || "").trim()
}

// A theme's name as omarchy-theme-current gives it: "cozy-ui" is "Cozy Ui".
function themeName(name) {
  return String(name || "").replace(/(^|-)([a-z])/g, function(match, dash, letter) { return dash + letter.toUpperCase() }).replace(/-/g, " ")
}

// A CPU's model without the maker's marks and filler: "AMD Ryzen 9 9900X
// 12-Core Processor" is "Ryzen 9 9900X".
function shortCpu(model) {
  return String(model || "")
    .replace(/\((R|TM|tm)\)/g, "")
    .replace(/^(AMD|Intel)\s+/, "")
    .replace(/\s+\d+-Core Processor.*$/, "")
    .replace(/\s+(CPU\s+)?@.*$/, "")
    .replace(/\s+(Processor|CPU)$/, "")
    .replace(/\s+w(ith|\/)\s+Radeon.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

// stats.sh's @system lines (key, value): host name, kernel and seconds
// since boot.
function parseSystem(lines) {
  var result = { hostname: "", kernel: "", uptime: null }
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f[0] === "uptime") result.uptime = Number(String(f[1]).split(" ")[0])
    else if (f[0] in result) result[f[0]] = f[1] || ""
  }
  return result
}

// Batteries from stats.sh's @power lines (supply, key, value), in watts and
// watt-hours. Some batteries report charge and current instead of energy
// and power; times the voltage, they are the same. `device` marks a
// peripheral's battery, such as a wireless mouse's.
function parsePower(lines) {
  var supplies = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f.length < 3) continue
    ;(supplies[f[0]] || (supplies[f[0]] = {}))[f[1]] = f[2]
  }
  function number(value, scale) { return value === undefined || value === "" ? null : Number(value) / scale }
  var result = []
  for (var id in supplies) {
    var s = supplies[id]
    if (s.type !== "Battery") continue
    var volts = number(s.voltage_now, 1e6)
    var power = number(s.power_now, 1e6)
    if (power === null && volts !== null && s.current_now !== undefined) power = Number(s.current_now) / 1e6 * volts
    var energy = number(s.energy_now, 1e6)
    if (energy === null && volts !== null && s.charge_now !== undefined) energy = Number(s.charge_now) / 1e6 * volts
    var full = number(s.energy_full, 1e6)
    if (full === null && volts !== null && s.charge_full !== undefined) full = Number(s.charge_full) / 1e6 * volts
    // What the battery held new, against what it holds full now: its
    // health. Both in energy or both in charge, so the ratio holds.
    var design = number(s.energy_full_design, 1)
    var held = number(s.energy_full, 1)
    if (design === null || held === null) { design = number(s.charge_full_design, 1); held = number(s.charge_full, 1) }
    var cycles = number(s.cycle_count, 1)
    result.push({
      id: id, name: s.model_name || id, kind: "", device: s.scope === "Device", status: s.status || "",
      capacity: number(s.capacity, 1), level: s.capacity_level || "", power: power, energy: energy, full: full,
      health: design > 0 && held !== null ? Math.min(100, held / design * 100) : null,
      // Batteries that do not count their cycles report 0.
      cycles: cycles > 0 ? cycles : null
    })
  }
  return result
}

// Peripherals' batteries from UPower's devices ({ nativePath, model, type,
// powerSupply, percentage 0 to 1, state }, with type and state by name),
// in parsePower's shape. UPower knows batteries the kernel does not list,
// such as Bluetooth headsets', and what kind of device each is ("Mouse",
// "Gaming input"), which the kernel does not say. Power supplies (a
// laptop's battery) and devices without a name are left out.
// `devices` can be array-like, as Quickshell's lists are; the result is an
// array.
function upowerBatteries(devices) {
  var result = []
  var count = devices ? devices.length || 0 : 0
  for (var i = 0; i < count; i++) {
    var d = devices[i]
    if (!d || d.powerSupply || !d.nativePath || d.type === "Unknown" || d.type === "LinePower") continue
    result.push({
      id: String(d.nativePath), name: String(d.model || d.type), kind: deviceKind(d.type), device: true, status: d.state === "Unknown" ? "" : String(d.state || ""),
      capacity: Math.round(Number(d.percentage || 0) * 100), level: "", power: null, energy: null, full: null,
      health: null, cycles: null
    })
  }
  return result
}

// UPower's type for a peripheral as a plain word, or "" for a type that
// says nothing a person would call the device ("BluetoothGeneric", "Pda",
// "OtherAudio"), which keeps its model name instead.
var DEVICE_KINDS = {
  Mouse: "Mouse", Keyboard: "Keyboard", Headset: "Headset", Headphones: "Headphones", Speakers: "Speakers",
  GamingInput: "Controller", Tablet: "Tablet", Phone: "Phone", Pen: "Pen", Touchpad: "Touchpad",
  RemoteControl: "Remote", Wearable: "Wearable", Toy: "Toy", MediaPlayer: "Media player", Camera: "Camera"
}

function deviceKind(type) {
  return DEVICE_KINDS[String(type || "")] || ""
}

// The battery that leads the battery panel: the laptop's, or else the
// first peripheral's that reports a charge; null without either.
function leadBattery(power) {
  return power.filter(function(b) { return !b.device })[0]
    || power.filter(function(b) { return b.capacity !== null })[0] || null
}

// The MPRIS player the media panel follows, from Quickshell's players: one
// playing a track it names, else any naming its track, else one playing;
// null when none is. A player that neither plays nor names a track is one
// left behind, such as a browser's after its tab closed: nothing playing.
function pickPlayer(players) {
  function first(test) { for (var i = 0; i < players.length; i++) if (test(players[i])) return players[i]; return null }
  return first(function(p) { return p.isPlaying && p.trackTitle })
    || first(function(p) { return p.trackTitle })
    || first(function(p) { return p.isPlaying })
    || null
}

// The CPU packages' energy counters from stats.sh's @rapl lines (zone,
// energy_uj, max_energy_range_uj, long-term limit in µW), summed, in
// joules: { energy, range, limit }, or null when none could be read. The
// kernel lets only root read them unless a udev rule opens them up. Only
// Intel's give a limit (PL1), in watts; else it is null.
function parseRapl(lines) {
  var energy = 0, range = 0, limit = 0, limited = true, read = false
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f[1] === undefined || f[1] === "" || isNaN(Number(f[1]))) continue
    energy += Number(f[1]) / 1e6
    range += Number(f[2] || 0) / 1e6
    if (Number(f[3]) > 0) limit += Number(f[3]) / 1e6
    else limited = false
    read = true
  }
  return read ? { energy: energy, range: range, limit: limited ? limit : null } : null
}

// AMD desktop CPUs' stock TDPs, in watts, by model: AMD keeps the power
// limit (PPT) in firmware, out of the kernel's reach, but sets it at 1.35
// times the TDP on AM4 and AM5.
var AMD_TDP = {
  "9950X3D": 170, "9950X": 170, "9900X3D": 120, "9900X": 120, "9800X3D": 120, "9700X": 65, "9600X": 65, "9600": 65,
  "7950X3D": 120, "7950X": 170, "7900X3D": 120, "7900X": 170, "7900": 65, "7800X3D": 120, "7700X": 105, "7700": 65, "7600X": 105, "7600": 65,
  "5950X": 105, "5900XT": 105, "5900X": 105, "5800XT": 105, "5800X3D": 105, "5800X": 105, "5700X3D": 105, "5700X": 65, "5700": 65, "5600X3D": 105, "5600X": 65, "5600": 65,
  "3950X": 105, "3900XT": 105, "3900X": 105, "3800XT": 105, "3800X": 105, "3700X": 65, "3600XT": 95, "3600X": 95, "3600": 65
}

var PPT_PER_TDP = 1.35

// The CPU's power limit in watts: Intel's own (`raplLimit`, parseRapl's),
// or an AMD desktop's stock PPT by `model`; null when neither is known.
function cpuPowerLimit(model, raplLimit) {
  if (raplLimit > 0) return raplLimit
  var match = /Ryzen \d+ (\w+)/.exec(String(model || ""))
  var tdp = match ? AMD_TDP[match[1]] : undefined
  return tdp ? Math.round(tdp * PPT_PER_TDP) : null
}

// Watts between two parseRapl readings; a counter that wrapped went past
// its range.
function raplWatts(before, after, seconds) {
  if (!before || !after || !(seconds > 0)) return null
  var used = after.energy - before.energy
  if (used < 0) used += after.range
  return used >= 0 ? used / seconds : null
}

// The mean of cpufreq's scaling_cur_freq values (kHz), in MHz.
function averageFrequency(lines) {
  var values = lines.map(Number).filter(function(n) { return n > 0 })
  if (!values.length) return null
  return values.reduce(function(a, b) { return a + b }, 0) / values.length / 1000
}
