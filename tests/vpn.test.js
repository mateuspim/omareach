import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { load } from "./qmljs.js"

// vpn.sh end to end, against made-up clients on PATH: each prints what its
// docs or source say it prints, so a change to how vpn.sh asks a client,
// or to how Net.parseVpnInfo reads it, shows up here. Only Proton and
// Tailscale were tried against real clients; NordVPN, Mullvad, PIA,
// IVPN, Windscribe and ExpressVPN are covered only by these.
const Net = load("StatsNet.js")
const plain = value => JSON.parse(JSON.stringify(value))
const script = new URL("../vpn.sh", import.meta.url).pathname
const root = mkdtempSync(join(tmpdir(), "vpn-"))
const bin = join(root, "bin")

// A client that prints `output` whatever it is asked, or answers piactl's
// and expressvpnctl's `get KEY` from `answers`.
const client = (name, output, answers) => {
  const body = answers
    ? `case "$2" in\n${Object.entries(answers).map(([key, value]) => `  ${key}) printf '%s\\n' '${value}' ;;`).join("\n")}\nesac\n`
    : `cat <<'EOF'\n${output}\nEOF\n`
  writeFileSync(join(bin, name), "#!/bin/bash\n" + body)
  chmodSync(join(bin, name), 0o755)
}
const reset = () => { rmSync(bin, { recursive: true, force: true }); mkdirSync(bin, { recursive: true }) }
// Only the fakes and the tools vpn.sh itself uses (timeout, awk): never a
// real client installed on this machine.
const tools = join(root, "tools")
mkdirSync(tools, { recursive: true })
for (const tool of ["timeout", "awk", "cat"]) {
  const found = spawnSync("bash", ["-c", "type -P " + tool], { encoding: "utf8" }).stdout.trim()
  writeFileSync(join(tools, tool), `#!/bin/bash\nexec ${found} "$@"\n`)
  chmodSync(join(tools, tool), 0o755)
}
// Found on the test's own PATH: the script's PATH holds only the fakes.
const bash = spawnSync("bash", ["-c", "type -P bash"], { encoding: "utf8" }).stdout.trim()
const run = (...clients) => {
  const env = { PATH: bin + ":" + tools, HOME: join(root, "home"), STATS_PROTON_CACHE: join(root, "none") }
  const result = spawnSync(bash, [script, ...clients], { encoding: "utf8", env })
  assert.equal(result.status, 0, result.stderr)
  return Net.parseVpnInfo(result.stdout)
}

const tests = {
  "NordVPN: nordvpn status, spinner and all"() {
    reset()
    client("nordvpn", "-\r  \r\\\r  \rStatus: Connected\nServer: Brazil #50\nHostname: br50.nordvpn.com\nCountry: Brazil\nCity: Sao Paulo\nCurrent technology: NORDLYNX")
    assert.deepEqual(plain(run("nordvpn").nordvpn), { place: "Sao Paulo, Brazil", details: ["Brazil #50", "NORDLYNX"] })
    client("nordvpn", "Status: Disconnected")
    assert.equal(run("nordvpn").nordvpn, undefined)
  },
  "Mullvad: mullvad status, new and old"() {
    reset()
    client("mullvad", "Connected\n    Relay:              se-got-wg-001\n    Features:           Quantum Resistance\n    Visible location:   Sweden, Gothenburg. IPv4: 185.0.0.1")
    assert.deepEqual(plain(run("mullvad").mullvad), { place: "Sweden, Gothenburg", details: ["se-got-wg-001"] })
    client("mullvad", "Connected to se-got-wg-001 in Gothenburg, Sweden")
    assert.equal(run("mullvad").mullvad.place, "Gothenburg, Sweden")
  },
  "PIA: piactl, one key at a time"() {
    reset()
    client("piactl", "", { connectionstate: "Connected", region: "us-florida" })
    assert.deepEqual(plain(run("pia").pia), { place: "us-florida", details: [] })
    client("piactl", "", { connectionstate: "Disconnected", region: "auto" })
    assert.equal(run("pia").pia, undefined)
  },
  "ExpressVPN: expressvpnctl, or the older expressvpn"() {
    reset()
    client("expressvpnctl", "", { connectionstate: "Connected", region: "usa-new-york" })
    // generic asks it, since its tunnel has no name of its own.
    assert.equal(run("generic").expressvpn.place, "usa-new-york")
    reset()
    client("expressvpn", "Connected to USA - New York\n\n - To check your connection status, type 'expressvpn status'.")
    assert.equal(run("generic").expressvpn.place, "USA - New York")
  },
  "IVPN: ivpn status, the place on the line after"() {
    reset()
    client("ivpn", "VPN         :  CONNECTED\n               us-ny.wg.ivpn.net [us-ny1.wg.ivpn.net], New York (US), United States\n    Protocol  :  WireGuard\nFirewall    :  Disabled")
    assert.deepEqual(plain(run("ivpn").ivpn), { place: "New York, US", details: ["us-ny1.wg.ivpn.net"] })
  },
  "Windscribe: only for its own tunnel"() {
    reset()
    client("windscribe-cli", "Internet connectivity: available\nConnect state: Connected: Boston\nProtocol: WireGuard:443")
    assert.deepEqual(plain(run("windscribe").windscribe), { place: "Boston", details: ["WireGuard:443"] })
    // windscribe-cli starts the app, so a generic tunnel never asks it.
    assert.equal(run("generic").windscribe, undefined)
  },
  "a generic tunnel takes whichever installed client says it is connected"() {
    reset()
    client("ivpn", "VPN : DISCONNECTED")
    client("mullvad", "Connected\n    Relay:              de-fra-ovpn-001\n    Visible location:   Germany, Frankfurt. IPv4: 185.0.0.2")
    const info = run("generic")
    assert.equal(info.ivpn, undefined)
    assert.equal(info.mullvad.place, "Germany, Frankfurt")
  },
  "no client installed, or an unknown one asked, prints nothing"() {
    reset()
    assert.deepEqual(plain(run("nordvpn", "generic", "nonsense")), {})
  }
}

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
rmSync(root, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
