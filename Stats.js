.pragma library

// The stats fill's data, without any QML: parsing what stats.sh and
// nvidia-smi print, turning counters into rates, the theme's palette and
// the text forms of numbers. StatsViews.js draws the panels from it.

// Samples kept for each graph.
var HISTORY = 60
// Seconds between two frames past which their counters no longer make a
// rate: the sampler was paused, or the session slept.
var GAP = 10
// Seconds between two process samples past which the same holds.
var PROCESS_GAP = 30
// Clock ticks per second in /proc/<pid>/stat (USER_HZ), 100 on Linux.
var HZ = 100
var MIB = 1048576

// --- stats.sh frames ---------------------------------------------------------

// A frame's lines by section, as { time, stat: [lines], meminfo: [...] }.
// Sections are opened by "@name" lines; "@time" carries its value.
function parseFrame(text) {
  var sections = { time: null }
  var current = null
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (line.charAt(0) === "@") {
      var parts = line.slice(1).split(" ")
      if (parts[0] === "time") { sections.time = Number(parts[1]); current = null; continue }
      if (parts[0] === "end") break
      current = sections[parts[0]] = []
    } else if (current && line !== "") {
      current.push(line)
    }
  }
  return sections
}

function ticks(line) {
  var f = line.trim().split(/\s+/).slice(1).map(Number)
  // user nice system idle iowait irq softirq steal; guest time is already
  // part of user.
  var idle = (f[3] || 0) + (f[4] || 0)
  var busy = (f[0] || 0) + (f[1] || 0) + (f[2] || 0) + (f[5] || 0) + (f[6] || 0) + (f[7] || 0)
  return { busy: busy, all: busy + idle }
}

// Busy and total ticks from /proc/stat's cpu lines.
function parseCpu(lines) {
  var result = { total: { busy: 0, all: 0 }, cores: [] }
  for (var i = 0; i < lines.length; i++) {
    if (/^cpu\s/.test(lines[i])) result.total = ticks(lines[i])
    else if (/^cpu\d/.test(lines[i])) result.cores.push(Object.assign({ id: lines[i].split(" ")[0] }, ticks(lines[i])))
  }
  return result
}

function share(a, b) {
  var all = b.all - a.all
  return all > 0 ? Math.max(0, Math.min(100, (b.busy - a.busy) / all * 100)) : 0
}

// Percent busy between two parseCpu samples, in total and per core. Cores
// match by name: one taken offline drops out of the list, and the next
// must not be measured against its ticks.
function cpuLoad(before, after) {
  var was = {}
  before.cores.forEach(function(core) { was[core.id] = core })
  return {
    total: share(before.total, after.total),
    cores: after.cores.map(function(core) { return was[core.id] ? share(was[core.id], core) : 0 })
  }
}

// Bytes from /proc/meminfo. Used is what the kernel could not hand out
// right now: total less available, as free and btop count it.
function parseMeminfo(lines) {
  var kb = {}
  for (var i = 0; i < lines.length; i++) {
    var match = /^(\w+):\s+(\d+)/.exec(lines[i])
    if (match) kb[match[1]] = Number(match[2]) * 1024
  }
  var total = kb.MemTotal || 0
  var available = kb.MemAvailable !== undefined ? kb.MemAvailable : (kb.MemFree || 0)
  return {
    total: total,
    used: Math.max(0, total - available),
    available: available,
    cached: (kb.Cached || 0) + (kb.Buffers || 0),
    swapTotal: kb.SwapTotal || 0,
    swapUsed: Math.max(0, (kb.SwapTotal || 0) - (kb.SwapFree || 0))
  }
}

// The interface of the default route in /proc/net/route, the lowest
// metric first; "" without one.
function defaultInterface(lines) {
  var best = "", metric = Infinity
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 8 || f[1] !== "00000000" || f[7] !== "00000000") continue
    if (Number(f[6]) < metric) { best = f[0]; metric = Number(f[6]) }
  }
  return best
}

// Received and sent bytes per interface from /proc/net/dev. Large counters
// can run into the colon, so the line splits there first.
function parseNetDev(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var colon = lines[i].indexOf(":")
    if (colon < 0) continue
    var f = lines[i].slice(colon + 1).trim().split(/\s+/)
    if (f.length < 9) continue
    result[lines[i].slice(0, colon).trim()] = { rx: Number(f[0]), tx: Number(f[8]) }
  }
  return result
}

// Tunnel interfaces by the name their client gives them, first match
// wins. A mesh (Tailscale and the like) joins a private network and leaves
// the rest of the traffic alone, so it is not a VPN in the sense of
// hiding where you browse from. Generic wg, tun and ppp names come last:
// ExpressVPN, OpenVPN and wg-quick use them. Obscura's Linux app names no
// interface in its documentation, so it is matched loosely. `client` is
// what vpn.sh asks where the tunnel goes. tap is left out: a VM's tap is
// far likelier than a VPN in tap mode.
var TUNNELS = [
  // A stopped Tailscale keeps tailscale0 up, with no address; the other
  // meshes take their interface down.
  { pattern: /^tailscale\d*$/, name: "Tailscale", mesh: true, client: "tailscale", staysUp: true },
  { pattern: /^zt[0-9a-z]+$/, name: "ZeroTier", mesh: true },
  { pattern: /^wt\d+$/, name: "NetBird", mesh: true },
  { pattern: /^nebula/, name: "Nebula", mesh: true },
  { pattern: /^(proton\d*|pvpn)/, name: "Proton VPN", mesh: false, client: "proton" },
  { pattern: /^(nordlynx|nordtun)$/, name: "NordVPN", mesh: false, client: "nordvpn" },
  { pattern: /mullvad/, name: "Mullvad", mesh: false, client: "mullvad" },
  { pattern: /obscura/i, name: "Obscura", mesh: false },
  { pattern: /^wgpia/, name: "PIA", mesh: false, client: "pia" },
  { pattern: /^wgivpn/, name: "IVPN", mesh: false, client: "ivpn" },
  // Windscribe's WireGuard adapter on Linux (Windscribe/Desktop-App,
  // src/helper/linux/wireguard/wireguardcontroller.h).
  { pattern: /^utun420$/, name: "Windscribe", mesh: false, client: "windscribe" },
  { pattern: /^CloudflareWARP$/, name: "WARP", mesh: false },
  { pattern: /^(wg|tun|ppp|vpn)/, name: "VPN", mesh: false, client: "generic" }
]

// What a tunnel interface is, by its name; null for one no VPN or mesh
// uses, such as a VM's tap (vnet0).
function tunnelKind(name) {
  for (var i = 0; i < TUNNELS.length; i++)
    if (TUNNELS[i].pattern.test(name)) return { name: TUNNELS[i].name, mesh: TUNNELS[i].mesh, client: TUNNELS[i].client || "", staysUp: TUNNELS[i].staysUp === true }
  return null
}

// stats.sh's @tunnel lines (interface, kind, routable IPv6, IPv4 address)
// as the VPNs and meshes that are connected. A VPN's tunnel exists only
// while it is; Tailscale's stays up while stopped, with no address it
// could be reached at. `uplink`, the default route's interface, is the
// internet itself, not a tunnel through it: PPPoE and mobile broadband
// are ppp0 too.
function parseTunnels(lines, uplink) {
  var result = { vpn: [], mesh: [] }
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    var known = tunnelKind(f[0])
    if (!known || f[0] === uplink) continue
    var address = f[3] || ""
    if (known.staysUp && f[2] !== "1" && !address) continue
    var list = known.mesh ? result.mesh : result.vpn
    if (list.some(function(entry) { return entry.name === known.name })) continue
    list.push({ name: known.name, interface: f[0], address: address, client: known.client })
  }
  return result
}

// The clients vpn.sh can ask about the tunnels in `network`, sorted, so
// the shell runs it again only when they change.
function tunnelClients(network) {
  var clients = []
  ;(network.vpn || []).concat(network.mesh || []).forEach(function(t) {
    if (t.client && clients.indexOf(t.client) === -1) clients.push(t.client)
  })
  return clients.sort()
}

// The clients vpn.sh asks about a tunnel no client names (tun0), in its
// order, with the name the row takes from the one that is connected.
var GENERIC_CLIENTS = [
  { client: "proton", name: "Proton VPN" },
  { client: "pia", name: "PIA" },
  { client: "expressvpn", name: "ExpressVPN" },
  { client: "ivpn", name: "IVPN" },
  { client: "mullvad", name: "Mullvad" }
]

// `key<TAB>value` lines, as vpn.sh prints what it reads itself, by key.
function tabFields(lines) {
  var fields = {}
  lines.forEach(function(line) {
    var tab = line.indexOf("\t")
    if (tab > 0) fields[line.slice(0, tab)] = line.slice(tab + 1).trim()
  })
  return fields
}

// A string as JSON wrote it, escapes and all, back to its text: vpn.sh
// lifts Proton's fields out of the app's JSON without parsing it, and the
// server list writes "São Paulo" as "S\u00e3o Paulo". Unchanged when it
// is not valid JSON string content.
function jsonText(value) {
  if (value.indexOf("\\") === -1) return value
  try { return JSON.parse('"' + value + '"') } catch (error) { return value }
}

// `Key: value` lines, as nordvpn status prints them, by key. nordvpn
// draws a spinner first ("-\r  \r") even into a pipe, so only what
// follows a line's last carriage return counts.
function colonFields(lines) {
  var fields = {}
  for (var i = 0; i < lines.length; i++) {
    var match = /^\s*([^:]+):\s*(.*?)\s*$/.exec(lines[i].slice(lines[i].lastIndexOf("\r") + 1))
    if (match) fields[match[1]] = match[2]
  }
  return fields
}

// A place from its parts, left out where empty: "Miami, US".
function place(parts) {
  return parts.filter(function(part) { return part }).join(", ")
}

// A Tailscale node's short name: the first label of its MagicDNS name,
// which is unique in the tailnet, else the host's own name.
function tailscaleName(node) {
  var dns = String(node.DNSName || "").split(".")[0]
  return dns || node.HostName || ""
}

// tailscale status --json: how many peers are online, the exit node
// traffic goes through, if any, and, for the row's hover text, this
// machine's names and addresses and each peer, online ones first, with
// how it is reached: straight (CurAddr) or through a DERP relay. The
// tailnet's name (CurrentTailnet) is left out: it is often the owner's
// email address. The MagicDNS names keep their tailXXXX.ts.net suffix.
function parseTailscale(text) {
  var status
  try { status = JSON.parse(text) } catch (error) { return null }
  if (!status || status.BackendState !== "Running") return null
  var peers = [], exitNode = ""
  for (var id in status.Peer || {}) peers.push(status.Peer[id])
  peers.forEach(function(peer) { if (peer.ExitNode) exitNode = tailscaleName(peer) })
  var self = status.Self || {}
  var nodes = peers.map(function(peer) {
    return {
      name: tailscaleName(peer),
      os: peer.OS || "",
      online: peer.Online === true,
      link: !peer.Online ? "" : peer.CurAddr ? "direct" : peer.Relay ? "relay " + peer.Relay : ""
    }
  }).sort(function(a, b) { return (b.online - a.online) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) })
  return {
    peers: peers.length,
    online: peers.filter(function(peer) { return peer.Online }).length,
    exitNode: exitNode,
    self: { name: tailscaleName(self), dns: String(self.DNSName || "").replace(/\.$/, ""), ips: self.TailscaleIPs || [] },
    nodes: nodes
  }
}

// vpn.sh's sections as where each client is connected: { proton: { place,
// server }, nordvpn, mullvad: { place }, tailscale: parseTailscale's }.
// Formats of nordvpn and mullvad status are from their documentation and
// untested here.
function parseVpnInfo(text) {
  var sections = {}, current = null
  String(text || "").split("\n").forEach(function(line) {
    var head = /^@(\w+)$/.exec(line)
    if (head) { current = head[1]; sections[current] = []; return }
    if (current) sections[current].push(line)
  })
  var info = {}
  if (sections.proton) {
    var proton = tabFields(sections.proton)
    for (var key in proton) proton[key] = jsonText(proton[key])
    // A server the list does not know yet still names its country:
    // BR#12, US-FL#332.
    var country = proton.country || (/^([A-Z]{2})\b/.exec(proton.server || "") || [])[1] || ""
    if (proton.server) info.proton = { server: proton.server, place: place([proton.city, country]), details: [proton.server + (proton.state || proton.city ? " · " + place([proton.city, proton.state]) : "")] }
  }
  if (sections.nordvpn) {
    var nord = colonFields(sections.nordvpn)
    if (/connected/i.test(nord.Status || "") && !/disconnected/i.test(nord.Status)) {
      info.nordvpn = { place: place([nord.City, nord.Country]), details: [nord.Server || nord.Hostname || "", nord["Current technology"] || ""].filter(function(line) { return line }) }
    }
  }
  if (sections.mullvad) {
    var mullvad = sections.mullvad.join("\n")
    // "Visible location: Sweden, Gothenburg. IPv4: …" in newer versions,
    // "Connected to se-got-wg-001 in Gothenburg, Sweden" in older ones.
    var visible = /Visible location:\s*([^.\n]+)/.exec(mullvad) || /Connected to \S+ in ([^.\n]+)/.exec(mullvad)
    var relay = /Relay:\s*(\S+)/.exec(mullvad) || /Connected to (\S+)/.exec(mullvad)
    if (/^Connected/m.test(mullvad) && visible) info.mullvad = { place: visible[1].trim(), details: relay ? [relay[1]] : [] }
  }
  // piactl and expressvpnctl, a key a line: "Connected", and the region
  // picked, which "auto" or "smart" leaves unsaid.
  ;["pia", "expressvpn"].forEach(function(client) {
    if (!sections[client]) return
    var fields = tabFields(sections[client])
    var region = /^(auto|smart)$/i.test(fields.region || "") ? "" : fields.region || ""
    if (fields.state === "Connected") info[client] = { place: region, details: [] }
    // The older expressvpn: "Connected to USA - New York".
    var older = /^Connected to (.+)$/m.exec(sections[client].join("\n"))
    if (older) info[client] = { place: older[1].trim(), details: [] }
  })
  if (sections.ivpn) {
    // "VPN : CONNECTED", then "gateway [host], City (CC), Country".
    var ivpn = sections.ivpn.join("\n")
    var server = /(\S+) \[(\S+)\], (.+?) \((\w\w)\), /.exec(ivpn)
    if (/VPN\s*:\s*CONNECTED/.test(ivpn)) info.ivpn = { place: server ? place([server[3], server[4]]) : "", details: server ? [server[2]] : [] }
  }
  if (sections.windscribe) {
    // "Connect state: Connected: Boston"; a * before Connected while its
    // tunnel test runs.
    var windscribe = /Connect state:\s*\*?\s*Connected(?::\s*(.+?))?\s*(\[.*\])?$/m.exec(sections.windscribe.join("\n"))
    var protocol = /Protocol:\s*(.+)$/m.exec(sections.windscribe.join("\n"))
    if (windscribe) info.windscribe = { place: (windscribe[1] || "").trim(), details: protocol ? [protocol[1].trim()] : [] }
  }
  if (sections.tailscale) {
    var tailscale = parseTailscale(sections.tailscale.join("\n"))
    if (tailscale) info.tailscale = tailscale
  }
  return info
}

// `state` with vpn.sh's `info` on its tunnels: each VPN's place, and a
// mesh's peers. A Tailscale exit node carries all traffic, so it counts
// as a VPN too.
function withTunnelInfo(state, info) {
  if (!info || !state.network) return state
  var network = Object.assign({}, state.network)
  // A tunnel no client names takes the first connected client's name
  // that no named tunnel has: Proton over OpenVPN is a plain tun0.
  var named = network.vpn.map(function(t) { return t.client })
  network.vpn = network.vpn.map(function(t) {
    var known = info[t.client], name = t.name
    if (t.client === "generic") {
      var owner = GENERIC_CLIENTS.filter(function(c) { return info[c.client] && named.indexOf(c.client) === -1 })[0]
      if (!owner) return t
      known = info[owner.client]
      name = owner.name
      named.push(owner.client)
    }
    if (!known) return t
    return Object.assign({}, t, { name: name, place: known.place || "", details: known.details || [] })
  })
  network.mesh = network.mesh.map(function(t) {
    var known = info[t.client]
    return known ? Object.assign({}, t, { peers: known.peers, online: known.online, status: known }) : t
  })
  var tailscale = info.tailscale
  var tailnet = network.mesh.filter(function(t) { return t.client === "tailscale" })[0]
  if (tailscale && tailscale.exitNode && tailnet) {
    network.vpn = network.vpn.concat([{ name: "Tailscale", interface: tailnet.interface, address: "", client: "tailscale", place: "via " + tailscale.exitNode }])
    network.vpnSeen = true
  }
  return Object.assign({}, state, { network: network })
}

// Whole disks, not partitions, device mapper or zram.
var DISK = /^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/

// Bytes read and written per disk from /proc/diskstats, which counts
// 512-byte sectors whatever the disk's own sector size.
function parseDiskstats(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 10 || !DISK.test(f[2])) continue
    result[f[2]] = { read: Number(f[5]) * 512, written: Number(f[9]) * 512 }
  }
  return result
}

// The share of the last 10 s some task stalled on each resource, from
// /proc/pressure, in percent.
function parsePressure(lines) {
  var result = { cpu: null, memory: null, io: null }
  for (var i = 0; i < lines.length; i++) {
    var match = /^(cpu|memory|io) some avg10=([\d.]+)/.exec(lines[i])
    if (match) result[match[1]] = Number(match[2])
  }
  return result
}

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
    memUsed: memUsed === null ? null : memUsed * MIB,
    memTotal: memTotal === null ? null : memTotal * MIB,
    temp: reading(f[5]),
    power: reading(f[6]),
    powerLimit: reading(f[7]),
    clock: reading(f[8]),
    fan: reading(f[9]),
    encoder: reading(f[10]),
    decoder: reading(f[11])
  }
}

// The programs holding the most memory in one process sample, by name as
// topProcesses adds them up, in bytes: their resident sets of `page`
// bytes a page (4096 without one). Pages two processes share count for
// each, as in top's RES.
function topMemory(procs, page, count) {
  page = page > 0 ? page : 4096
  var byName = {}
  for (var pid in procs) {
    var p = procs[pid]
    if (!(p.rss > 0)) continue
    var entry = byName[p.name] || (byName[p.name] = { pid: Number(pid), name: p.name, memory: 0, count: 0, most: 0 })
    entry.memory += p.rss * page
    entry.count++
    if (p.rss > entry.most) { entry.most = p.rss; entry.pid = Number(pid) }
  }
  return Object.keys(byName).map(function(name) {
    var entry = byName[name]
    return { pid: entry.pid, name: entry.name, memory: entry.memory, count: entry.count }
  }).sort(function(a, b) { return b.memory - a.memory }).slice(0, count)
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
    apps.push({ pid: Number(f[0]), name: shortName(f.slice(1, -1).join(",")), memory: memory === null ? 0 : memory * MIB })
  }
  return apps.sort(function(a, b) { return b.memory - a.memory })
}

// Name and CPU ticks (user plus system) per pid from /proc/<pid>/stat
// lines. The name sits in parentheses and can hold anything, parentheses
// included, so it runs to the last one.
function parseProcs(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    var open = line.indexOf(" ("), close = line.lastIndexOf(")")
    if (open < 0 || close < open) continue
    var f = line.slice(close + 2).split(" ")
    if (f.length < 13) continue
    // Field 24, the resident set in pages, where the line has it.
    result[line.slice(0, open)] = { name: line.slice(open + 2, close), ticks: Number(f[11]) + Number(f[12]), rss: f.length > 21 ? Number(f[21]) || 0 : 0 }
  }
  return result
}

// The busiest programs between two parseProcs samples `seconds` apart, as
// top counts it: 100% is one core. Processes of the same name add up, as
// a browser's dozens of them are one program at a glance; `pid` is the
// busiest one's and `count` how many there are. A pid that changed name
// was reused, and one that is new has no baseline; both are left out.
function topProcesses(before, after, seconds, count) {
  var byName = {}
  if (!(seconds > 0)) return []
  for (var pid in after) {
    var was = before[pid]
    if (!was || was.name !== after[pid].name) continue
    var cpu = (after[pid].ticks - was.ticks) / HZ / seconds * 100
    if (!(cpu > 0)) continue
    var name = after[pid].name
    var entry = byName[name] || (byName[name] = { pid: Number(pid), name: name, cpu: 0, count: 0, most: 0 })
    entry.cpu += cpu
    entry.count++
    if (cpu > entry.most) { entry.most = cpu; entry.pid = Number(pid) }
  }
  return Object.keys(byName).map(function(name) {
    var entry = byName[name]
    return { pid: entry.pid, name: entry.name, cpu: entry.cpu, count: entry.count }
  }).sort(function(a, b) { return b.cpu - a.cpu }).slice(0, count)
}

// --- state -----------------------------------------------------------------

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
  var cards = parseDrm(frame.drm || [])
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
    cpu: parseCpu(frame.stat || []),
    net: parseNetDev(frame.net || []),
    disk: parseDiskstats(frame.disk || []),
    rapl: parseRapl(frame.rapl || []),
    drmIdle: {}
  }
  for (var card in cards) if (cards[card].idle_ms !== undefined) counters.drmIdle[card] = cards[card].idle_ms
  // Sensors stats.sh reads every few frames only (a Dell's fans, through
  // firmware) keep their last lines between reads.
  var slow = frame.slowhwmon || state.slowHwmon || []
  next.slowHwmon = slow
  var sensors = parseSensors((frame.hwmon || []).concat(slow), frame.nvme || [])
  // stats.sh reads NVMe temperatures every few frames only; between them
  // the last ones stand.
  if (!frame.nvme) { sensors.nvme = state.nvmeTemps || {}; sensors.nvmeLimits = state.nvmeLimits || {} }

  var load = before ? cpuLoad(before.cpu, counters.cpu) : null
  next.cpu = {
    total: load ? load.total : null,
    cores: load ? load.cores : [],
    // Each core's CPU number, for coreGroups: cpu7 is 7.
    coreIds: load ? counters.cpu.cores.map(function(core) { return Number(core.id.slice(3)) }) : [],
    threads: counters.cpu.cores.length,
    temp: sensors.cpuTemp,
    tempLimit: sensors.cpuLimit,
    frequency: averageFrequency(frame.freq || []),
    power: before ? raplWatts(before.rapl, counters.rapl, seconds) : null,
    powerLimit: counters.rapl ? counters.rapl.limit : null,
    loadavg: (frame.loadavg && frame.loadavg[0] ? frame.loadavg[0].split(" ").slice(0, 3).map(Number) : [])
  }
  if (load) history.cpu = pushHistory(history.cpu, load.total)

  next.memory = parseMeminfo(frame.meminfo || [])

  var name = defaultInterface(frame.route || []) || busiestInterface(counters.net)
  var now = counters.net[name]
  var was = before && before.net[name]
  var tunnels = parseTunnels(frame.tunnel || [], defaultInterface(frame.route || []))
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

  next.pressure = parsePressure(frame.psi || [])

  next.fans = sensors.fans
  next.temps = sensors.temps
  next.nvmeTemps = sensors.nvme
  next.nvmeLimits = sensors.nvmeLimits
  next.system = frame.system ? parseSystem(frame.system) : null
  next.sysinfo = frame.sysinfo ? parseSysinfo(frame.sysinfo) : state.sysinfo
  var tasks = next.cpu.loadavg.length && frame.loadavg[0].split(" ")[3]
  next.threads = tasks ? Number(tasks.split("/")[1]) : null
  next.power = parsePower(frame.power || [])
  next.drmKinds = Object.assign({}, state.drmKinds)
  next.drm = drmGpus(cards, before ? before.drmIdle : {}, seconds, next.drmKinds, state.drm, next.sysinfo)

  if (frame.procs) {
    var procs = parseProcs(frame.procs)
    var last = state.processSample
    var elapsed = last ? frame.time - last.time : 0
    if (last && elapsed > 0 && elapsed <= PROCESS_GAP) next.processes = topProcesses(last.procs, procs, elapsed, 10)
    next.memoryProcesses = topMemory(procs, Number((next.sysinfo || {}).page_size), 10)
    next.processSample = { time: frame.time, procs: procs }
  }
  if (frame.gpuapps) next.gpuApps = parseGpuApps(frame.gpuapps)

  next.time = frame.time
  next.counters = counters
  next.history = history
  return next
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
    if (c.temp !== undefined) { gpu.temp = c.temp / 1000; gpu.tempLimit = tempLimit(c.temp_crit === undefined ? "" : String(c.temp_crit), "gpu") }
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
  else if (state.nvidia) all.push(Object.assign({ id: "nvidia" + state.nvidia.index, vendor: "NVIDIA", kind: "discrete", asleep: false, tempLimit: TEMP_LIMITS.nvidia }, state.nvidia))
  all = all.concat(state.drm || [])
  var main = null, integrated = null
  for (var i = 0; i < all.length; i++) if (all[i].kind === "discrete") { main = all[i]; break }
  if (!main) main = all[0] || null
  for (var j = 0; j < all.length; j++) if (all[j].kind === "integrated" && all[j] !== main) { integrated = all[j]; break }
  return { main: main, integrated: integrated }
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
  var next = ingest(state, parseFrame(text))
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
  var updated = ingestGpu(next, gpuLine)
  if (updated !== next) {
    next = updated
    var reading = next.nvidia
    next.nvidiaName = reading.name
    next.nvidiaIdle = reading.load === 0 && !reading.encoder && !reading.decoder ? state.nvidiaIdle + 1 : 0
    next.nvidia = Object.assign({}, reading, { resting: false })
  } else if (next.nvidiaPower.asleep) {
    next.nvidiaIdle = 0
  } else if (next.nvidia && nvidiaPoll(next) !== "on") {
    // Read only now and then, it keeps its last reading.
    if (!next.nvidia.resting) next.nvidia = Object.assign({}, next.nvidia, { resting: true })
    next.nvidiaAge = 0
  } else if (next.nvidia && ++next.nvidiaAge > NVIDIA_STALE) { next.nvidia = null; next.nvidiaAge = 0 }
  if (media !== undefined) next.media = media
  var roles = gpuRoles(next)
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

// --- theme -------------------------------------------------------------------

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
    boxes: { gpu: cyan, igpu: mix(cyan, green, 0.5), temps: mix(yellow, red, 0.5), battery: green, media: mix(magenta, blue, 0.5), system: accent, cpu: magenta, memory: green, network: mix(cyan, blue, 0.5), disks: mix(yellow, green, 0.35), processes: blue, clock: yellow },
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

// --- levels ------------------------------------------------------------------

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

// --- text --------------------------------------------------------------------

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
