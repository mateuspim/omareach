.pragma library
.import "StatsProc.js" as Proc
.import "StatsSystem.js" as Sys

// The GPU panels' data, without any QML: nvidia-smi's lines, the DRM
// cards stats.sh reads, which GPU is which, and when to wake an idle one.

// nvidia-smi's "[N/A]" and "[Not Supported]" are null.
function reading(text) {
  var value = Number(text)
  return text === "" || /^\[/.test(text) || !isFinite(value) ? null : value
}

// The marketing prefixes nobody reads on a small card.
function gpuName(name) {
  return String(name).replace(/^NVIDIA\s+/, "").replace(/^GeForce\s+/, "").trim()
}

// One line of nvidia-smi --query-gpu=index,name,utilization.gpu,
// memory.used,memory.total,temperature.gpu,power.draw,power.limit,
// clocks.gr,fan.speed,utilization.encoder,utilization.decoder
// --format=csv,noheader,nounits; null for anything else.
function parseGpu(line) {
  var f = String(line).split(",").map(function(part) { return part.trim() })
  if (f.length !== 12 || !/^\d+$/.test(f[0])) return null
  var memUsed = reading(f[3]), memTotal = reading(f[4])
  return {
    index: Number(f[0]),
    name: gpuName(f[1]),
    load: reading(f[2]),
    memUsed: memUsed === null ? null : memUsed * Proc.MIB,
    memTotal: memTotal === null ? null : memTotal * Proc.MIB,
    temp: reading(f[5]),
    power: reading(f[6]),
    powerLimit: reading(f[7]),
    clock: reading(f[8]),
    fan: reading(f[9]),
    encoder: reading(f[10]),
    decoder: reading(f[11])
  }
}

// A process's short name: its file name without a Windows .exe, as Proton
// games report a full Windows path.
function shortName(path) {
  var parts = String(path).trim().split(/[\\\/]/)
  return parts[parts.length - 1].replace(/\.exe$/i, "")
}

// Apps on the GPU from nvidia-smi --query-compute-apps=pid,process_name,
// used_memory --format=csv,noheader,nounits, by video memory.
function parseGpuApps(lines) {
  var apps = []
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split(",")
    if (f.length < 3 || !/^\s*\d+\s*$/.test(f[0])) continue
    var memory = reading(f[f.length - 1].trim())
    apps.push({ pid: Number(f[0]), name: shortName(f.slice(1, -1).join(",")), memory: memory === null ? 0 : memory * Proc.MIB })
  }
  return apps.sort(function(a, b) { return b.memory - a.memory })
}

// `state` updated with nvidia-smi's lines since the last frame (one, or a
// list: it prints a line per GPU). With several NVIDIA GPUs the one with
// the lowest index is shown. Without a line, `state` as it was.
function ingestGpu(state, lines) {
  var gpu = null
  ;[].concat(lines || []).forEach(function(line) {
    var parsed = parseGpu(line)
    if (parsed && (!gpu || parsed.index < gpu.index)) gpu = parsed
  })
  if (!gpu) return state
  var next = Object.assign({}, state)
  next.nvidia = gpu
  next.nvidiaMissing = false
  next.nvidiaAge = 0
  return next
}

// Frames without an nvidia-smi line after which its reading is dropped:
// nvidia-smi stopped, rather than a line arriving late.
var NVIDIA_STALE = 5

// The AMD and Intel lines of stats.sh's @drm section (card, driver, key,
// value) by card: { card2: { driver: "amdgpu", busy: 99, ... } }.
function parseDrm(lines) {
  var cards = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f.length < 4 || f[3] === "") continue
    var card = cards[f[0]] || (cards[f[0]] = { driver: f[1] })
    card[f[2]] = f[2] === "status" || f[2] === "control" ? f[3] : Number(f[3])
  }
  return cards
}

// A card's name for its panel: the marketing name without the vendor's
// prefix ("AMD Radeon 780M" reads "Radeon 780M"), or a generic one.
function drmName(name, amd, discrete) {
  // "Graphics" goes only after a model: "AMD Radeon Graphics" stays whole.
  name = String(name || "").replace(/^AMD\s+/, "").replace(/^(Radeon\s+\S.*?)\s+Graphics$/, "$1").trim()
  if (name) return amd || /^Intel /.test(name) ? name : "Intel " + name
  return amd ? (discrete ? "Radeon" : "Radeon Graphics") : (discrete ? "Intel Arc" : "Intel Graphics")
}

// Intel cards with this much VRAM or more are discrete. AMD's tell: a
// discrete card's memory has a vendor (`dedicated`), while an integrated
// one's is a share of system memory, however large.
var DISCRETE_VRAM = 4 * 1073741824

// GPUs, in the shape parseGpu gives NVIDIA's, from parseDrm's cards.
// `idleBefore` holds each Intel card's idle milliseconds from the frame
// `seconds` before: Intel has no load reading, so load is the share of
// that time the GPU was not idle. A card the kernel has put to sleep is
// left asleep, with no readings: reading it would wake it.
// `kinds` holds each card's kind as last seen awake, and is kept current:
// a sleeping card reports no VRAM, and keeps the kind it had.
// A resting card (stats.sh leaves an idle one alone so it can sleep) keeps
// its readings from `previous`, the GPUs before. `sysinfo` carries each
// card's marketing name as stats.sh looked it up (gpu_name_card2); without
// one, a card is named by vendor and kind.
function drmGpus(cards, idleBefore, seconds, kinds, previous, sysinfo) {
  kinds = kinds || {}
  return Object.keys(cards).sort().map(function(id) {
    var c = cards[id]
    var amd = c.driver === "amdgpu"
    var memTotal = c.vram_total !== undefined ? c.vram_total : null
    if (amd ? c.status !== "suspended" && !c.rest : memTotal !== null)
      kinds[id] = (amd ? c.dedicated === 1 : memTotal >= DISCRETE_VRAM) ? "discrete" : "integrated"
    if (c.rest && c.status !== "suspended") {
      var last = (previous || []).filter(function(gpu) { return gpu.id === id })[0]
      if (last) return Object.assign({}, last, { asleep: false, resting: true })
    }
    var discrete = kinds[id] === "discrete"
    var gpu = {
      id: id,
      vendor: amd ? "AMD" : "Intel",
      name: drmName((sysinfo || {})["gpu_name_" + id], amd, discrete),
      kind: discrete ? "discrete" : "integrated",
      asleep: c.status === "suspended",
      resting: false,
      load: null, memUsed: null, memTotal: null, temp: null, tempLimit: null, power: null, powerLimit: null,
      clock: null, fan: null, encoder: null, decoder: null
    }
    if (gpu.asleep) return gpu
    if (c.busy !== undefined) gpu.load = c.busy
    else if (c.idle_ms !== undefined && idleBefore[id] !== undefined && seconds > 0)
      gpu.load = Math.max(0, Math.min(100, 100 * (1 - (c.idle_ms - idleBefore[id]) / (seconds * 1000))))
    gpu.memTotal = memTotal
    if (c.vram_used !== undefined) gpu.memUsed = c.vram_used
    if (c.temp !== undefined) { gpu.temp = c.temp / 1000; gpu.tempLimit = Sys.tempLimit(c.temp_crit === undefined ? "" : String(c.temp_crit), "gpu") }
    if (c.power !== undefined) gpu.power = c.power / 1e6
    if (c.power_cap !== undefined) gpu.powerLimit = c.power_cap / 1e6
    if (c.freq !== undefined) gpu.clock = c.freq / 1e6
    else if (c.freq_mhz !== undefined) gpu.clock = c.freq_mhz
    if (c.pwm !== undefined) gpu.fan = Math.round(c.pwm / 255 * 100)
    return gpu
  })
}

// The NVIDIA GPU while it sleeps: its name, if it was seen awake, and no
// readings.
function asleepNvidia(state) {
  return {
    id: "nvidia" + (state.nvidia ? state.nvidia.index : 0), vendor: "NVIDIA", kind: "discrete", asleep: true, resting: false,
    name: state.nvidiaName || "NVIDIA GPU",
    load: null, memUsed: null, memTotal: null, temp: null, tempLimit: null, power: null, powerLimit: null,
    clock: null, fan: null, encoder: null, decoder: null
  }
}

// Frames in a row a dGPU that can power itself down must show no load
// before it is left to rest: nvidia-smi stops, and stats.sh reads an AMD
// card only now and then. Reading a GPU keeps it awake.
var REST_AFTER = 5

// How the sampler should read the NVIDIA GPU: "on", nvidia-smi's loop;
// "check", a single reading now and then, while it rests; "off", not at
// all, while it sleeps. Only a dGPU that can power itself down rests.
function nvidiaPoll(state) {
  var power = state.nvidiaPower || {}
  if (!power.managed) return "on"
  if (power.asleep) return "off"
  return state.nvidiaIdle >= REST_AFTER ? "check" : "on"
}

// Which GPU each panel shows: `main`, for the GPU panel, is the first
// discrete one (NVIDIA first), or else the only kind there is; `integrated`,
// for the iGPU panel, an integrated GPU beside it, or null.
function gpuRoles(state) {
  var all = []
  var power = state.nvidiaPower || {}
  if (power.asleep) all.push(asleepNvidia(state))
  // nvidia-smi's slowdown temperature is not a field every driver's
  // --query-gpu takes, and an unknown field fails the whole query.
  else if (state.nvidia) all.push(Object.assign({ id: "nvidia" + state.nvidia.index, vendor: "NVIDIA", kind: "discrete", asleep: false, tempLimit: Sys.TEMP_LIMITS.nvidia }, state.nvidia))
  all = all.concat(state.drm || [])
  var main = null, integrated = null
  for (var i = 0; i < all.length; i++) if (all[i].kind === "discrete") { main = all[i]; break }
  if (!main) main = all[0] || null
  for (var j = 0; j < all.length; j++) if (all[j].kind === "integrated" && all[j] !== main) { integrated = all[j]; break }
  return { main: main, integrated: integrated }
}
