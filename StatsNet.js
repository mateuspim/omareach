.pragma library

// The Network card's data, without any QML: interfaces and their
// counters, and the VPN and mesh tunnels with what their clients say.

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
