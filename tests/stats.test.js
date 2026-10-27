import assert from "node:assert/strict"
import { plain, frame, Proc, Gpu, Stats, run } from "./statsfixtures.js"

// Stats.js: frames and nvidia-smi lines turned into the dashboard's state.

const tests = {
  "ingest leaves the default route's ppp out of the VPNs"() {
    const pppoe = frame(1, [0]).replace("eno1\t00000000", "ppp0\t00000000") + "@tunnel\nppp0\tppp\t1\t\n"
    const state = Stats.ingest(Stats.empty(), Proc.parseFrame(pppoe))
    assert.deepEqual(plain(state.network.vpn), [])
    assert.equal(state.network.vpnSeen, false)
  },
  "ingest remembers a VPN was on after it goes off"() {
    let state = Stats.ingest(Stats.empty(), Proc.parseFrame(frame(1, [0])))
    assert.equal(state.network.vpnSeen, false)
    state = Stats.ingest(state, Proc.parseFrame(frame(2, [0], "@tunnel\nproton0\twireguard\t1\t\n")))
    assert.equal(state.network.vpn[0].name, "Proton VPN")
    state = Stats.ingest(state, Proc.parseFrame(frame(3, [0], "@tunnel\n")))
    assert.deepEqual(plain(state.network.vpn), [])
    assert.equal(state.network.vpnSeen, true)
  },
  "history keeps the last samples, oldest first"() {
    let series = []
    for (let i = 1; i <= 5; i++) series = Stats.pushHistory(series, i, 3)
    assert.deepEqual(plain(series), [3, 4, 5])
  },
  "ingest turns two frames into loads and rates"() {
    let state = Stats.ingest(Stats.empty(), Proc.parseFrame(frame(100, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, null)
    assert.equal(state.network.rx, null)
    assert.equal(state.memory.used, (63412576 - 35827448) * 1024)
    state = Stats.ingest(state, Proc.parseFrame(frame(102, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, 50)
    assert.equal(state.cpu.cores.length, 2)
    assert.equal(state.cpu.temp, 67.375)
    assert.deepEqual(plain(state.cpu.loadavg), [0.52, 0.61, 0.7])
    assert.equal(state.network.interface, "eno1")
    assert.equal(state.network.rx, 1000)
    assert.equal(state.network.tx, 100)
    const nvme = state.disks.find(disk => disk.name === "nvme0n1")
    assert.deepEqual(plain(nvme), { name: "nvme0n1", model: "KINGSTON SFYRDK2000G", read: 1024, write: 0, temp: 34.85, tempLimit: 80 })
    assert.equal(state.disks.find(disk => disk.name === "sda").temp, null)
    assert.deepEqual(plain(state.history.cpu), [50])
    assert.deepEqual(plain(state.history.rx), [1000])
  },
  "ingest turns the CPU's energy counter into watts"() {
    let state = Stats.ingest(Stats.empty(), Proc.parseFrame(frame(100, [0])))
    assert.equal(state.cpu.power, null)
    state = Stats.ingest(state, Proc.parseFrame(frame(102, [0])))
    assert.equal(state.cpu.power, 65)
    // The counter wraps at its range.
    const wrap = text => text.replace(/@rapl\n[^\n]*/, "@rapl\npackage-0\t" + text.match(/@time (\S+)/)[1] * 1e6 + "\t100000000")
    state = Stats.ingest(Stats.empty(), Proc.parseFrame(wrap(frame(98, [0]))))
    state = Stats.ingest(state, Proc.parseFrame(wrap(frame(2, [0])).replace("@time 2", "@time 99")))
    assert.equal(state.cpu.power, 4)
    // Unreadable without a udev rule: no power.
    state = Stats.ingest(Stats.empty(), Proc.parseFrame(frame(100, [0]).replace(/@rapl\n[^\n]*\n/, "@rapl\n")))
    state = Stats.ingest(state, Proc.parseFrame(frame(101, [0]).replace(/@rapl\n[^\n]*\n/, "@rapl\n")))
    assert.equal(state.cpu.power, null)
  },
  "ingest starts the rates over after a long gap"() {
    let state = Stats.ingest(Stats.empty(), Proc.parseFrame(frame(100, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0])))
    state = Stats.ingest(state, Proc.parseFrame(frame(200, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, null)
    assert.equal(state.network.rx, null)
  },
  "ingest ranks processes when the frame carries them"() {
    const procs = ticks => `@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 ${ticks} 0 0 0\n@gpuapps\n1, /opt/game, 512\n`
    let state = Stats.ingest(Stats.empty(), Proc.parseFrame(frame(10, [0], procs(100))))
    assert.deepEqual(plain(state.processes), [])
    state = Stats.ingest(state, Proc.parseFrame(frame(11, [0])))
    assert.deepEqual(plain(state.processes), [])
    state = Stats.ingest(state, Proc.parseFrame(frame(13, [0], procs(400))))
    assert.deepEqual(plain(state.processes), [{ pid: 1, name: "game", cpu: 100, count: 1 }])
    assert.deepEqual(plain(state.gpuApps), [{ pid: 1, name: "game", memory: 512 * 1048576 }])
  },
  "an NVIDIA reading that stops coming is dropped after a few frames"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), ["0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    for (let t = 11; t <= 13; t++) state = Stats.step(state, frame(t, [0]), [])
    // A frame or two without a line is timing; the reading stays.
    assert.equal(state.nvidia.load, 55)
    for (let t = 14; t <= 16; t++) state = Stats.step(state, frame(t, [0]), [])
    assert.equal(state.nvidia, null)
  },
  "a sleeping discrete GPU keeps the kind it had awake"() {
    const awake = "@drm\ncard1\tamdgpu\tstatus\tactive\ncard1\tamdgpu\tdedicated\t1\ncard1\tamdgpu\tvram_total\t17163091968\ncard1\tamdgpu\tbusy\t5\n"
    const asleep = "@drm\ncard1\tamdgpu\tstatus\tsuspended\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], awake), [])
    state = Stats.step(state, frame(11, [0], asleep), [])
    const card = state.drm.find(gpu => gpu.id === "card1")
    assert.equal(card.asleep, true)
    assert.equal(card.kind, "discrete")
    assert.equal(card.name, "Radeon")
    // So the GPU panel keeps it, asleep, rather than swapping to the iGPU.
    assert.equal(Gpu.gpuRoles(state).main.id, "card1")
  },
  "the iGPU history starts over when another GPU takes the panel"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), ["0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    assert.deepEqual(plain(state.history.igpu), [99])
    const intel = "@drm\ncard0\ti915\tstatus\tactive\ncard0\ti915\tidle_ms\t100\n"
    state = Stats.step(state, frame(11, [0], intel), [])
    assert.equal(Gpu.gpuRoles(state).integrated.id, "card0")
    assert.deepEqual(plain(state.history.igpu), [])
  },
  "NVMe temperatures carry over frames that do not read them"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), [])
    state = Stats.step(state, frame(11, [0]).replace(/@nvme\n(.*\n)*?@freq/, "@freq"), [])
    assert.equal(state.nvmeTemps.nvme0, 34.85)
    assert.equal(state.disks.find(disk => disk.name === "nvme0n1").temp, 34.85)
  },
  "step applies a frame and the GPU line that came with it in one update"() {
    const gpuLine = "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"
    let state = Stats.step(Stats.empty(), frame(10, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0]), gpuLine)
    state = Stats.step(state, frame(11, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0]), "")
    assert.equal(state.cpu.total, 50)
    assert.equal(state.nvidia.load, 55)
    // The GPU history advances with the frames, one sample each.
    assert.deepEqual(plain(state.history.gpu), [55, 55])
    assert.equal(state.history.gpu.length, state.history.cpu.length + 1)
    assert.deepEqual(plain(state.history.igpu), [99, 99])
  },
  "the GPU history starts over when another GPU becomes the main one"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), "")
    assert.deepEqual(plain(state.history.gpu), [99])
    state = Stats.step(state, frame(11, [0]), "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0")
    assert.deepEqual(plain(state.history.gpu), [55])
  },
}

run(tests)
