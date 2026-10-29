import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Net, Proc, Stats } from "./statsfixtures.js"

// Runs the real stats.sh on this machine and reads its frames the way the
// shell does.
const script = new URL("../stats.sh", import.meta.url).pathname

// stats.sh INTERVAL PROCESS_EVERY FRAMES
const run = (...args) => execFileSync("bash", [script, ...args.map(String)], { encoding: "utf8", timeout: 10000 })
const runWith = (env, ...args) => execFileSync("bash", [script, ...args.map(String)], { encoding: "utf8", timeout: 10000, env: { ...process.env, ...env } })
const frames = text => text.split("@end\n").filter(frame => frame.trim()).map(Proc.parseFrame)

const tests = {
  "every frame ends with @end and carries a time"() {
    const text = run(0.2, 0, 2)
    assert.ok(text.endsWith("@end\n"))
    const parsed = frames(text)
    assert.equal(parsed.length, 2)
    assert.ok(parsed[1].time > parsed[0].time)
  },
  "a frame has every section the panels read"() {
    const [frame] = frames(run(0.1, 0, 1))
    for (const section of ["stat", "loadavg", "meminfo", "route", "net", "disk"])
      assert.ok(Array.isArray(frame[section]) && frame[section].length > 0, section)
    // Sensors, cpufreq and pressure can be missing, as in a CI VM; their
    // sections are there, empty.
    for (const section of ["model", "psi", "hwmon", "nvme", "freq", "drm", "power", "rapl"])
      assert.ok(Array.isArray(frame[section]), section)
    for (const section of ["system"])
      assert.ok(Array.isArray(frame[section]), section)
    assert.equal(frame.procs, undefined)
  },
  "processes come every PROCESS_EVERY frames, from the first"() {
    const parsed = frames(run(0.1, 2, 3))
    assert.ok(parsed[0].procs.length > 10)
    assert.equal(parsed[1].procs, undefined)
    assert.ok(parsed[2].procs.length > 10)
  },
  "slow sensors come every fifth frame, from the first"() {
    const parsed = frames(run(0.05, 0, 6))
    assert.ok(Array.isArray(parsed[0].slowhwmon))
    assert.ok(Array.isArray(parsed[0].nvme))
    for (const i of [1, 2, 3, 4]) assert.equal(parsed[i].slowhwmon, undefined)
    assert.ok(Array.isArray(parsed[5].slowhwmon))
  },
  "system facts come every sixtieth frame, from the first"() {
    const parsed = frames(run(0.05, 0, 2))
    const info = Object.fromEntries(parsed[0].sysinfo.map(line => line.split("\t")))
    assert.ok(info.os && info.cpu, JSON.stringify(info))
    // Omarchy's version is its package's, as omarchy-version gives it.
    const pkg = execFileSync("bash", ["-c", "pacman -Q omarchy 2>/dev/null | cut -d' ' -f2 || true"], { encoding: "utf8" }).trim()
    if (pkg) assert.equal(info.omarchy, pkg)
    const channel = execFileSync("bash", ["-c", "command -v omarchy-version-channel >/dev/null && omarchy-version-channel || true"], { encoding: "utf8" }).trim()
    if (channel) assert.equal(info.channel, channel)
    assert.equal(parsed[1].sysinfo, undefined)
  },
  "STATS_NVIDIA=0 keeps nvidia-smi from running for the GPU apps"() {
    const [frame] = frames(runWith({ STATS_NVIDIA: "0" }, 0.1, 1, 1))
    assert.ok(frame.procs.length > 10)
    assert.equal(frame.gpuapps, undefined)
  },
  "tunnels come from the interfaces, with addresses only when asked"() {
    // A made-up /sys/class/net: WireGuard, a stopped Tailscale, Proton's
    // leak guard (a dummy), a VM's tap, a down tun and a wired card; and
    // an `ip` that prints addresses as `ip -o -4 addr show` does.
    const root = mkdtempSync(join(tmpdir(), "omareach-net-"))
    const iface = (name, type, flags, extra = {}) => {
      mkdirSync(join(root, "net", name), { recursive: true })
      writeFileSync(join(root, "net", name, "type"), type + "\n")
      writeFileSync(join(root, "net", name, "flags"), flags + "\n")
      writeFileSync(join(root, "net", name, "uevent"), extra.uevent || "INTERFACE=" + name + "\n")
      if (extra.tun) writeFileSync(join(root, "net", name, "tun_flags"), extra.tun + "\n")
    }
    iface("proton0", 65534, "0x91", { uevent: "DEVTYPE=wireguard\nINTERFACE=proton0\n" })
    iface("tailscale0", 65534, "0x1091", { tun: "0x5001" })
    iface("ipv6leakintrf0", 1, "0x83")
    iface("vnet0", 1, "0x1003", { tun: "0x1002" })
    iface("tun9", 65534, "0x1090", { tun: "0x1001" })
    iface("eno1", 1, "0x1003")
    writeFileSync(join(root, "if_inet6"), [
      "fe800000000000000000000000000001 05 40 20 80 tailscale0",
      "fd000000000000000000000000000002 04 40 00 80 proton0"
    ].join("\n") + "\n")
    mkdirSync(join(root, "bin"))
    writeFileSync(join(root, "bin", "ip"), "#!/bin/sh\necho '4: proton0    inet 10.2.0.2/32 scope global proton0\\       valid_lft forever preferred_lft forever'\n", { mode: 0o755 })
    const env = { STATS_SYS_NET: join(root, "net"), STATS_IF_INET6: join(root, "if_inet6"), PATH: join(root, "bin") + ":" + process.env.PATH }
    try {
      const [quiet] = frames(runWith(env, 0.1, 0, 1))
      assert.deepEqual([...quiet.tunnel], ["proton0\twireguard\t1\t", "tailscale0\ttun\t0\t", "vnet0\ttap\t0\t"])
      const [asked] = frames(runWith({ ...env, STATS_TUNNEL_ADDRESS: "1" }, 0.1, 0, 1))
      assert.equal(asked.tunnel[0], "proton0\twireguard\t1\t10.2.0.2")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
  "vpn.sh finds Proton's server and its place in the app's cache"() {
    const root = mkdtempSync(join(tmpdir(), "omareach-vpn-"))
    mkdirSync(join(root, "connection"))
    writeFileSync(join(root, "connection", "connection_persistence.json"), JSON.stringify({ backend: "linuxnetworkmanager", server: { server_name: "BR#12", domain: "node-br-1.protonvpn.net" } }))
    // Pretty-printed like the app's list, with a server whose name
    // starts the same and fields of the server's own entries in between.
    writeFileSync(join(root, "serverlist.json"), JSON.stringify({ LogicalServers: [
      { Name: "BR#1", ExitCountry: "BR", City: "Rio de Janeiro", State: "" },
      { Name: "BR#12", Tier: 2, ExitCountry: "BR", City: "Sao Paulo", Servers: [{ EntryIP: "1.2.3.4", Label: "3" }], State: "Sao Paulo" },
      { Name: "US-FL#332", ExitCountry: "US", City: "Miami", State: "Florida" }
    ] }, null, 4))
    try {
      const text = execFileSync("bash", [new URL("../vpn.sh", import.meta.url).pathname, "proton", "unknown"], { encoding: "utf8", env: { ...process.env, STATS_PROTON_CACHE: root } })
      assert.equal(text, "@proton\nserver\tBR#12\ncountry\tBR\ncity\tSao Paulo\nstate\tSao Paulo\n")
      assert.equal(Net.parseVpnInfo(text).proton.place, "Sao Paulo, BR")
      // For a plain tun0 only an OpenVPN connection counts.
      const vpn = new URL("../vpn.sh", import.meta.url).pathname
      // A PATH of only what vpn.sh needs, so no VPN client installed here
      // answers.
      const bin = join(root, "bin")
      mkdirSync(bin)
      const where = tool => execFileSync("bash", ["-c", "type -P " + tool], { encoding: "utf8" }).trim()
      for (const tool of ["awk", "timeout"]) symlinkSync(where(tool), join(bin, tool))
      const bash = where("bash")
      const generic = () => execFileSync(bash, [vpn, "generic"], { encoding: "utf8", env: { ...process.env, STATS_PROTON_CACHE: root, PATH: bin } })
      assert.equal(generic().includes("@proton"), false)
      writeFileSync(join(root, "connection", "connection_persistence.json"), JSON.stringify({ protocol: "openvpn-udp", server: { server_name: "BR#12" } }))
      assert.ok(generic().startsWith("@proton\nserver\tBR#12\n"))
      rmSync(join(root, "connection"), { recursive: true })
      assert.equal(execFileSync("bash", [new URL("../vpn.sh", import.meta.url).pathname, "proton"], { encoding: "utf8", env: { ...process.env, STATS_PROTON_CACHE: root } }), "")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
  "two frames make real loads and rates"() {
    const state = frames(run(0.3, 1, 2)).reduce(Stats.ingest, Stats.empty())
    assert.ok(state.cpu.total >= 0 && state.cpu.total <= 100)
    assert.ok(state.cpu.cores.length > 0)
    assert.ok(state.memory.total > 0)
    assert.ok(state.network.interface !== "")
    assert.ok(state.disks.length > 0)
    assert.ok(Array.isArray(state.processes))
  },
}

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
process.exit(failed ? 1 : 0)
