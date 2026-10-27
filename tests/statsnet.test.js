import assert from "node:assert/strict"
import { plain, frame, Proc, Net, run } from "./statsfixtures.js"

// StatsNet.js: interfaces, VPNs and meshes.

const tests = {
  "parseNetDev reads byte counters, glued colons and all"() {
    const net = Net.parseNetDev(Proc.parseFrame(frame(0, [0])).net)
    assert.deepEqual(plain(net.eno1), { rx: 29099514268, tx: 1410672755 })
    assert.deepEqual(plain(net.lo), { rx: 173185512, tx: 173185512 })
  },
  "tunnelKind names VPNs and meshes by their interface, generic names last"() {
    assert.deepEqual(plain(Net.tunnelKind("proton0")), { name: "Proton VPN", mesh: false, client: "proton", staysUp: false })
    assert.equal(Net.tunnelKind("nordlynx").name, "NordVPN")
    assert.equal(Net.tunnelKind("nordtun").name, "NordVPN")
    // Mullvad's wg-quick name starts like any WireGuard tunnel.
    assert.equal(Net.tunnelKind("wg0-mullvad").name, "Mullvad")
    assert.equal(Net.tunnelKind("CloudflareWARP").name, "WARP")
    assert.deepEqual(plain(Net.tunnelKind("tailscale0")), { name: "Tailscale", mesh: true, client: "tailscale", staysUp: true })
    assert.equal(Net.tunnelKind("ztabcdef12").name, "ZeroTier")
    assert.equal(Net.tunnelKind("tun0").name, "VPN")
    assert.equal(Net.tunnelKind("wg0").name, "VPN")
    // A VM's tap device is no VPN, whatever its name.
    assert.equal(Net.tunnelKind("vnet0"), null)
    assert.equal(Net.tunnelKind("tap0"), null)
  },
  "parseTunnels counts a mesh only once it has an address"() {
    const tunnels = Net.parseTunnels([
      "proton0\twireguard\t1\t",
      // Stopped: tailscale0 stays up with only its link-local address.
      "tailscale0\ttun\t0\t",
      "vnet0\ttap\t0\t"
    ])
    assert.deepEqual(plain(tunnels), { vpn: [{ name: "Proton VPN", interface: "proton0", address: "", client: "proton" }], mesh: [] })
    const connected = Net.parseTunnels(["tailscale0\ttun\t1\t", "ztabc\ttap\t0\t10.147.17.5"])
    assert.deepEqual(plain(connected.mesh.map(t => t.name)), ["Tailscale", "ZeroTier"])
    assert.equal(connected.mesh[1].address, "10.147.17.5")
    // Two tunnels of one client make one name.
    assert.equal(Net.parseTunnels(["tun0\ttun\t1\t", "tun1\ttun\t1\t"]).vpn.length, 1)
  },
  "parseTunnels counts other meshes by their interface, and leaves the uplink out"() {
    // NetBird and ZeroTier are often IPv4-only; their interface goes down
    // when they stop.
    assert.deepEqual(plain(Net.parseTunnels(["wt0\ttun\t0\t"]).mesh.map(t => t.name)), ["NetBird"])
    assert.deepEqual(plain(Net.parseTunnels(["ztabcdef12\ttap\t0\t"]).mesh.map(t => t.name)), ["ZeroTier"])
    // A PPPoE link carrying the default route is the internet, and does
    // not hide the VPN through it.
    const tunnels = Net.parseTunnels(["ppp0\tppp\t1\t", "tun0\ttun\t1\t"], "ppp0")
    assert.deepEqual(plain(tunnels.vpn.map(t => t.interface)), ["tun0"])
    assert.deepEqual(plain(Net.parseTunnels(["ppp0\tppp\t1\t"], "eno1").vpn.map(t => t.interface)), ["ppp0"])
  },
  "the small parsers behind parseVpnInfo"() {
    assert.deepEqual(plain(Net.tabFields(["server\tBR#12", "city\t São Paulo ", "no tab", "\tempty key"])), { server: "BR#12", city: "São Paulo" })
    assert.deepEqual(plain(Net.colonFields(["Status: Connected", "  Current technology: NORDLYNX  ", "no colon"])), { Status: "Connected", "Current technology": "NORDLYNX" })
    // nordvpn's spinner, printed even into a pipe.
    assert.deepEqual(plain(Net.colonFields(["-\r  \r\\\r  \rStatus: Connected"])), { Status: "Connected" })
    assert.equal(Net.place(["Miami", "", "US"]), "Miami, US")
    assert.equal(Net.place(["", ""]), "")
    assert.equal(Net.tailscaleName({ DNSName: "nas.tail1234.ts.net.", HostName: "NAS box" }), "nas")
    assert.equal(Net.tailscaleName({ HostName: "NAS box" }), "NAS box")
    assert.equal(Net.jsonText("S\\u00e3o"), "São")
    assert.equal(Net.jsonText("plain"), "plain")
    assert.equal(Net.parseVpnInfo("@nordvpn\n-\r  \rStatus: Connected\nCountry: Brazil\nCity: Sao Paulo\n").nordvpn.place, "Sao Paulo, Brazil")
  },
  "parseVpnInfo reads where each client is connected"() {
    const tailscale = JSON.stringify({
      BackendState: "Running",
      CurrentTailnet: { Name: "someone@example.com" },
      Self: { HostName: "Desk PC", DNSName: "desk.tail1234.ts.net.", TailscaleIPs: ["100.64.0.1", "fd7a:115c:a1e0::1"] },
      Peer: {
        a: { HostName: "nas", DNSName: "nas.tail1234.ts.net.", OS: "linux", Online: true, CurAddr: "192.168.1.5:41641" },
        b: { HostName: "phone", OS: "iOS", Online: false },
        c: { HostName: "vps", OS: "linux", Online: true, ExitNode: true, CurAddr: "", Relay: "fra" }
      }
    }, null, 2)
    const info = Net.parseVpnInfo([
      "@proton", "server\tUS-FL#332", "country\tUS", "city\tMiami", "state\tFlorida",
      "@tailscale", tailscale,
      "@nordvpn", "Status: Connected", "Server: Brazil #50", "Country: Brazil", "City: Sao Paulo",
      "@mullvad", "Connected", "    Relay:              se-got-wg-001", "    Visible location:   Sweden, Gothenburg. IPv4: 185.0.0.1"
    ].join("\n"))
    assert.deepEqual(plain(info.proton), { server: "US-FL#332", place: "Miami, US", details: ["US-FL#332 · Miami, Florida"] })
    // The tailnet's name, often an email address, stays out; peers go by
    // their MagicDNS names, online first.
    assert.deepEqual(plain(info.tailscale), {
      peers: 3, online: 2, exitNode: "vps",
      self: { name: "desk", dns: "desk.tail1234.ts.net", ips: ["100.64.0.1", "fd7a:115c:a1e0::1"] },
      nodes: [
        { name: "nas", os: "linux", online: true, link: "direct" },
        { name: "vps", os: "linux", online: true, link: "relay fra" },
        { name: "phone", os: "iOS", online: false, link: "" }
      ]
    })
    assert.deepEqual(plain(info.nordvpn), { place: "Sao Paulo, Brazil", details: ["Brazil #50"] })
    assert.deepEqual(plain(info.mullvad), { place: "Sweden, Gothenburg", details: ["se-got-wg-001"] })
    // Older mullvad, a server the list lacks, and clients that are off.
    assert.equal(Net.parseVpnInfo("@mullvad\nConnected to se-got-wg-001 in Gothenburg, Sweden\n").mullvad.place, "Gothenburg, Sweden")
    assert.deepEqual(plain(Net.parseVpnInfo("@proton\nserver\tBR#12\n").proton), { server: "BR#12", place: "BR", details: ["BR#12"] })
    // The server list's JSON escapes come back as letters.
    const escaped = Net.parseVpnInfo("@proton\nserver\tBR#19\ncountry\tBR\ncity\tS\\u00e3o Paulo\nstate\tS\\u00e3o Paulo\n").proton
    assert.deepEqual(plain(escaped), { server: "BR#19", place: "São Paulo, BR", details: ["BR#19 · São Paulo, São Paulo"] })
    assert.equal(Net.jsonText("a\\qb"), "a\\qb")
    assert.equal(Net.parseVpnInfo("@nordvpn\nStatus: Disconnected\n").nordvpn, undefined)
    assert.equal(Net.parseVpnInfo("@tailscale\n" + JSON.stringify({ BackendState: "Stopped" })).tailscale, undefined)
    assert.equal(Net.parseVpnInfo("@tailscale\nnot json").tailscale, undefined)
  },
  "parseVpnInfo reads PIA, ExpressVPN, IVPN and Windscribe"() {
    assert.deepEqual(plain(Net.parseVpnInfo("@pia\nstate\tConnected\nregion\tus-florida\n").pia), { place: "us-florida", details: [] })
    // "auto" says nothing about where it went; still connected.
    assert.deepEqual(plain(Net.parseVpnInfo("@pia\nstate\tConnected\nregion\tauto\n").pia), { place: "", details: [] })
    assert.equal(Net.parseVpnInfo("@pia\nstate\tDisconnected\nregion\tauto\n").pia, undefined)
    assert.equal(Net.parseVpnInfo("@expressvpn\nstate\tConnected\nregion\tsmart\n").expressvpn.place, "")
    assert.equal(Net.parseVpnInfo("@expressvpn\nConnected to USA - New York\n").expressvpn.place, "USA - New York")
    // ivpn status, as cli/commands/base.go lays it out.
    const ivpn = Net.parseVpnInfo([
      "@ivpn",
      "VPN         :  CONNECTED",
      "               us-ny.wg.ivpn.net [us-ny1.wg.ivpn.net], New York (US), United States",
      "    Protocol  :  WireGuard"
    ].join("\n")).ivpn
    assert.deepEqual(plain(ivpn), { place: "New York, US", details: ["us-ny1.wg.ivpn.net"] })
    assert.equal(Net.parseVpnInfo("@ivpn\nVPN : DISCONNECTED\n").ivpn, undefined)
    // windscribe-cli status, as src/windscribe-cli/strings.cpp words it.
    const windscribe = Net.parseVpnInfo("@windscribe\nInternet connectivity: available\nConnect state: *Connected: Boston [Network interference]\nProtocol: WireGuard:443\n").windscribe
    assert.deepEqual(plain(windscribe), { place: "Boston", details: ["WireGuard:443"] })
    assert.equal(Net.parseVpnInfo("@windscribe\nConnect state: Disconnected\n").windscribe, undefined)
  },
  "a tunnel no client names takes the connected client's name"() {
    const tun = { name: "VPN", interface: "tun0", address: "", client: "generic" }
    const network = { vpn: [tun], mesh: [], vpnSeen: true }
    assert.deepEqual(plain(Net.tunnelClients(network)), ["generic"])
    const proton = Net.withTunnelInfo({ network }, { proton: { server: "BR#12", place: "Sao Paulo, BR", details: ["BR#12"] } })
    assert.deepEqual(plain([proton.network.vpn[0].name, proton.network.vpn[0].place]), ["Proton VPN", "Sao Paulo, BR"])
    // A client a named tunnel already has does not name the generic one.
    const both = Net.withTunnelInfo({ network: { vpn: [{ name: "Proton VPN", interface: "proton0", client: "proton" }, tun], mesh: [], vpnSeen: true } }, { proton: { place: "Miami, US" }, pia: { place: "" } })
    assert.deepEqual(plain(both.network.vpn.map(t => t.name)), ["Proton VPN", "PIA"])
    // No client says it is connected: it stays a VPN.
    assert.equal(Net.withTunnelInfo({ network }, {}).network.vpn[0].name, "VPN")
    assert.equal(Net.tunnelKind("wgivpn").name, "IVPN")
    assert.equal(Net.tunnelKind("utun420").client, "windscribe")
  },
  "withTunnelInfo places VPNs, counts mesh peers and takes an exit node for a VPN"() {
    const network = { vpn: [{ name: "Proton VPN", interface: "proton0", address: "", client: "proton" }], mesh: [{ name: "Tailscale", interface: "tailscale0", address: "", client: "tailscale" }], vpnSeen: true }
    assert.deepEqual(plain(Net.tunnelClients(network)), ["proton", "tailscale"])
    const state = Net.withTunnelInfo({ network }, { proton: { server: "US-FL#332", place: "Miami, US" }, tailscale: { peers: 4, online: 1, exitNode: "" } })
    assert.equal(state.network.vpn[0].place, "Miami, US")
    assert.equal(state.network.mesh[0].online, 1)
    assert.equal(Net.withTunnelInfo({ network }, null).network, network)
    const exit = Net.withTunnelInfo({ network: Object.assign({}, network, { vpn: [], vpnSeen: false }) }, { tailscale: { peers: 4, online: 1, exitNode: "vps" } })
    assert.deepEqual(plain(exit.network.vpn.map(t => [t.name, t.place])), [["Tailscale", "via vps"]])
    // The exit node's row names the mesh's own interface.
    const second = { vpn: [], mesh: [{ name: "Tailscale", interface: "tailscale1", client: "tailscale" }], vpnSeen: false }
    assert.equal(Net.withTunnelInfo({ network: second }, { tailscale: { peers: 1, online: 1, exitNode: "vps" } }).network.vpn[0].interface, "tailscale1")
    assert.equal(exit.network.vpnSeen, true)
  },
  "defaultInterface follows the default route, the lowest metric first"() {
    const lines = Proc.parseFrame(frame(1, [0])).route
    assert.equal(Net.defaultInterface(lines), "eno1")
    assert.equal(Net.defaultInterface([lines[0], "wlan0\t00000000\t0\t3\t0\t0\t600\t00000000", "eth1\t00000000\t0\t3\t0\t0\t50\t00000000"]), "eth1")
    assert.equal(Net.defaultInterface([lines[0]]), "")
  },
}

run(tests)
