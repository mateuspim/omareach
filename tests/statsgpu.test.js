import assert from "node:assert/strict"
import { plain, frame, Proc, Gpu, Stats, run } from "./statsfixtures.js"

// StatsGpu.js: nvidia-smi, DRM cards and which GPU is which.

const tests = {
  "parseGpu reads nvidia-smi's CSV, with N/A as null"() {
    const gpu = Gpu.parseGpu("0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 12")
    assert.deepEqual(plain(gpu), {
      index: 0, name: "RTX 4080", load: 55, memUsed: 7551 * 1048576, memTotal: 16376 * 1048576,
      temp: 54, power: 149.65, powerLimit: 320, clock: 2790, fan: 30, encoder: 0, decoder: 12
    })
    assert.equal(Gpu.parseGpu("0, Tesla T4, 3, 100, 15360, 40, [N/A], [Not Supported], 300, [N/A], 0, 0").fan, null)
    assert.equal(Gpu.parseGpu("NVIDIA-SMI has failed"), null)
  },
  "parseGpuApps lists apps by video memory, with short names"() {
    const apps = Gpu.parseGpuApps([
      "407143, S:\\steamapps\\common\\MGSDelta\\Binaries\\Win64\\MGSDelta-Win64-Shipping.exe, 7204",
      "2211, /usr/bin/python3, 812",
      "No running processes found"
    ])
    assert.deepEqual(plain(apps), [
      { pid: 407143, name: "MGSDelta-Win64-Shipping", memory: 7204 * 1048576 },
      { pid: 2211, name: "python3", memory: 812 * 1048576 }
    ])
  },
  "ingestGpu keeps the NVIDIA GPU with the lowest index of a frame's lines"() {
    const lines = ["1, NVIDIA GeForce RTX 3060, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9", "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0", "garbage"]
    let state = Gpu.ingestGpu(Stats.empty(), lines)
    assert.equal(state.nvidia.name, "RTX 4080")
    // Every frame brings both GPUs' lines; the lowest index keeps updating.
    state = Gpu.ingestGpu(state, ["1, NVIDIA GeForce RTX 3060, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9", "0, NVIDIA GeForce RTX 4080, 70, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    assert.equal(state.nvidia.load, 70)
  },
  "parseDrm reads AMD and Intel cards from stats.sh"() {
    const cards = Gpu.parseDrm([
      "card2\tamdgpu\tstatus\tactive", "card2\tamdgpu\tbusy\t99", "card2\tamdgpu\tvram_total\t2147483648",
      "card0\ti915\tfreq_mhz\t1300", "card0\ti915\tidle_ms\t5000",
      "card3\tamdgpu\tstatus\tsuspended"
    ])
    assert.deepEqual(plain(cards.card2), { driver: "amdgpu", status: "active", busy: 99, vram_total: 2147483648 })
    assert.equal(cards.card0.idle_ms, 5000)
    assert.equal(cards.card3.status, "suspended")
  },
  "drmGpus names a card by the marketing name stats.sh looked up"() {
    const card = { card2: { driver: "amdgpu", status: "active", busy: 5 } }
    // From pci.ids, the bracketed product; from amdgpu.ids, without "AMD".
    assert.equal(Gpu.drmGpus(card, {}, 0, {}, [], { gpu_name_card2: "Radeon 610M" })[0].name, "Radeon 610M")
    assert.equal(Gpu.drmGpus(card, {}, 0, {}, [], { gpu_name_card2: "AMD Radeon 780M Graphics" })[0].name, "Radeon 780M")
    assert.equal(Gpu.drmGpus({ card0: { driver: "i915", freq_mhz: 300 } }, {}, 0, {}, [], { gpu_name_card0: "UHD Graphics 770" })[0].name, "Intel UHD Graphics 770")
    assert.equal(Gpu.drmGpus(card, {}, 0, {}, [], { gpu_name_card2: "AMD Radeon Graphics" })[0].name, "Radeon Graphics")
    // Without one, by vendor and kind.
    assert.equal(Gpu.drmGpus(card, {}, 0, {}, [], {})[0].name, "Radeon Graphics")
  },
  "Intel load is the share of time the GPU was not idle"() {
    const now = { card0: { driver: "i915", freq_mhz: 1300, idle_ms: 5750 } }
    const [intel] = Gpu.drmGpus(now, { card0: 5000 }, 1)
    assert.equal(intel.vendor, "Intel")
    assert.equal(intel.kind, "integrated")
    assert.equal(intel.load, 25)
    assert.equal(intel.clock, 1300)
    // Without a sample before, there is no load yet.
    assert.equal(Gpu.drmGpus(now, {}, 1)[0].load, null)
    // xe names its counters the same once stats.sh has read them.
    assert.equal(Gpu.drmGpus({ card0: { driver: "xe", idle_ms: 2000 } }, { card0: 1000 }, 2)[0].load, 50)
  },
  "drmGpus turns cards into GPUs, integrated or discrete"() {
    const sections = Proc.parseFrame(frame(0, [0]))
    const [amd] = plain(Gpu.drmGpus(Gpu.parseDrm(sections.drm), {}, 0))
    assert.deepEqual(amd, {
      id: "card2", vendor: "AMD", name: "Radeon Graphics", kind: "integrated", asleep: false, resting: false,
      load: 99, memUsed: 1228115968, memTotal: 2147483648, temp: 60, tempLimit: 100, power: 0.157, powerLimit: null,
      clock: 2200, fan: null, encoder: null, decoder: null
    })
    // An AMD card with memory of its own (from a VRAM vendor) is a discrete one, and its fan
    // speed comes from its PWM duty.
    const big = Gpu.drmGpus({ card1: { driver: "amdgpu", status: "active", busy: 40, dedicated: 1, vram_total: 17163091968, pwm: 102, power_cap: 300000000 } }, {}, 0)[0]
    assert.equal(big.kind, "discrete")
    assert.equal(big.name, "Radeon")
    assert.equal(big.fan, 40)
    assert.equal(big.powerLimit, 300)
    // A sleeping card is reported asleep, with no readings.
    const asleep = Gpu.drmGpus({ card3: { driver: "amdgpu", status: "suspended" } }, {}, 0)[0]
    assert.equal(asleep.asleep, true)
    assert.equal(asleep.load, null)
    // A card that gives a critical temperature is measured against it.
    assert.equal(Gpu.drmGpus({ card1: { driver: "amdgpu", status: "active", temp: 70000, temp_crit: 110000 } }, {}, 0)[0].tempLimit, 110)
  },
  "gpuRoles puts the discrete GPU first and the integrated one beside it"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0")
    let roles = Gpu.gpuRoles(state)
    assert.equal(roles.main.name, "RTX 4080")
    assert.equal(roles.integrated.name, "Radeon Graphics")
    // With only the iGPU, it is the main GPU and there is no second one.
    state = Stats.step(Stats.empty(), frame(10, [0]), "")
    roles = Gpu.gpuRoles(state)
    assert.equal(roles.main.name, "Radeon Graphics")
    assert.equal(roles.integrated, null)
  },
}

run(tests)
