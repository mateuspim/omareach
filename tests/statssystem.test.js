import assert from "node:assert/strict"
import { plain, frame, full, Proc, Sys, run } from "./statsfixtures.js"

// StatsSystem.js: sensors, names, batteries, the player and CPU power.

const tests = {
  "parseSensors takes each sensor's critical temperature as its limit"() {
    // stats.sh's fifth column, as a coretemp gives its TjMax and a DDR5
    // module its limit; NVMe lines carry theirs third.
    const sensors = Sys.parseSensors([
      "coretemp\ttemp1\tPackage id 0\t72000\t105000",
      "spd5118\ttemp1\t\t51000\t85000",
      "spd5118\ttemp1\t\t49000\t"
    ], ["nvme0\t42850\t84850", "nvme1\t33850"])
    assert.equal(sensors.cpuTemp, 72)
    assert.equal(sensors.cpuLimit, 105)
    assert.deepEqual(plain(sensors.temps.map(t => t.limit)), [105, 85, 85])
    assert.deepEqual(plain(sensors.nvmeLimits), { nvme0: 84.85, nvme1: 80 })
    // k10temp gives none: AMD desktops throttle at 95 °C.
    assert.equal(Sys.parseSensors(["k10temp\ttemp1\tTctl\t66000\t"], []).cpuLimit, 95)
  },
  "parseSystem reads the host, kernel and uptime"() {
    const system = Sys.parseSystem(Proc.parseFrame(frame(0, [0])).system)
    assert.deepEqual(plain(system), { hostname: "odin", kernel: "7.2.5-3-omarchy", uptime: 35458.33 })
  },
  "parsePower reads batteries, in watts and watt-hours"() {
    const supplies = Sys.parsePower([
      "BAT0\ttype\tBattery", "BAT0\tstatus\tDischarging", "BAT0\tcapacity\t81",
      "BAT0\tpower_now\t12500000", "BAT0\tenergy_now\t40000000", "BAT0\tenergy_full\t50000000",
      "AC\ttype\tMains", "AC\tonline\t0",
      "BAT1\ttype\tBattery", "BAT1\tstatus\tCharging", "BAT1\tcapacity\t50",
      "BAT1\tcurrent_now\t2000000", "BAT1\tvoltage_now\t12000000", "BAT1\tcharge_now\t2000000", "BAT1\tcharge_full\t4000000",
      "hidpp_battery_0\ttype\tBattery", "hidpp_battery_0\tscope\tDevice", "hidpp_battery_0\tcapacity_level\tLow", "hidpp_battery_0\tmodel_name\tMX Keys"
    ])
    assert.deepEqual(plain(supplies.map(s => s.id)), ["BAT0", "BAT1", "hidpp_battery_0"])
    assert.deepEqual(plain(supplies[0]), { id: "BAT0", name: "BAT0", kind: "", device: false, status: "Discharging", capacity: 81, level: "", power: 12.5, energy: 40, full: 50, health: null, cycles: null })
    // Charge and current, as some batteries report, times the voltage.
    assert.equal(supplies[1].power, 24)
    assert.equal(supplies[1].energy, 24)
    assert.equal(supplies[1].full, 48)
    assert.deepEqual(plain(supplies[2]), { id: "hidpp_battery_0", name: "MX Keys", kind: "", device: true, status: "", capacity: null, level: "Low", power: null, energy: null, full: null, health: null, cycles: null })
  },
  "parsePower lists a mouse once when its receiver and cable both report it"() {
    const supplies = Sys.parsePower([
      "hidpp_battery_0\ttype\tBattery", "hidpp_battery_0\tscope\tDevice", "hidpp_battery_0\tstatus\tUnknown", "hidpp_battery_0\tcapacity\t21", "hidpp_battery_0\tmodel_name\tG502 X",
      "hidpp_battery_2\ttype\tBattery", "hidpp_battery_2\tscope\tDevice", "hidpp_battery_2\tstatus\tCharging", "hidpp_battery_2\tcapacity\t71", "hidpp_battery_2\tmodel_name\tG502 X"
    ])
    assert.deepEqual(plain(supplies.map(b => [b.id, b.capacity])), [["hidpp_battery_2", 71]])
  },
  "parsePower leaves a laptop's batteries and different peripherals alone"() {
    const supplies = Sys.parsePower([
      "BAT0\ttype\tBattery", "BAT0\tcapacity\t50", "BAT0\tmodel_name\tX", "BAT1\ttype\tBattery", "BAT1\tcapacity\t60", "BAT1\tmodel_name\tX",
      "a\ttype\tBattery", "a\tscope\tDevice", "a\tmodel_name\tMouse", "b\ttype\tBattery", "b\tscope\tDevice", "b\tmodel_name\tPad"
    ])
    assert.equal(supplies.length, 4)
  },
  "parsePower reads a battery's health and cycles"() {
    const [energy, charge, uncounted] = Sys.parsePower([
      "BAT0\ttype\tBattery", "BAT0\tenergy_full\t45000000", "BAT0\tenergy_full_design\t50000000", "BAT0\tcycle_count\t312",
      "BAT1\ttype\tBattery", "BAT1\tcharge_full\t3600000", "BAT1\tcharge_full_design\t4000000",
      "BAT2\ttype\tBattery", "BAT2\tcycle_count\t0"
    ])
    assert.equal(energy.health, 90)
    assert.equal(energy.cycles, 312)
    assert.equal(charge.health, 90)
    // A battery that does not count its cycles reports 0.
    assert.equal(uncounted.cycles, null)
    assert.equal(uncounted.health, null)
  },
  "averageFrequency is in MHz"() {
    assert.equal(Sys.averageFrequency(["5399595", "4800000"]), 5099.7975)
    assert.equal(Sys.averageFrequency([]), null)
  },
  "parseRapl sums the packages' energy counters, in joules"() {
    assert.deepEqual(plain(Sys.parseRapl(["package-0\t2000000\t65532610987", "package-1\t1000000\t65532610987"])),
      { energy: 3, range: 131065.221974, limit: null })
    assert.equal(Sys.parseRapl([]), null)
    assert.equal(Sys.parseRapl(["package-0\t\t65532610987"]), null)
    // Intel's long-term limit (PL1) comes with the counter, in microwatts.
    assert.equal(Sys.parseRapl(["package-0\t2000000\t65532610987\t125000000"]).limit, 125)
  },
  "cpuPowerLimit is Intel's own limit, or an AMD desktop's stock PPT by model"() {
    assert.equal(Sys.cpuPowerLimit("Intel(R) Core(TM) i7-14700K", 125), 125)
    // PPT is 1.35 times the TDP on AM4 and AM5.
    assert.equal(Sys.cpuPowerLimit("AMD Ryzen 9 9900X 12-Core Processor", null), 162)
    assert.equal(Sys.cpuPowerLimit("AMD Ryzen 7 9800X3D 8-Core Processor", null), 162)
    assert.equal(Sys.cpuPowerLimit("AMD Ryzen 9 7950X 16-Core Processor", null), 230)
    assert.equal(Sys.cpuPowerLimit("AMD Ryzen 7 5800X3D 8-Core Processor", null), 142)
    assert.equal(Sys.cpuPowerLimit("AMD Ryzen 5 7600 6-Core Processor", null), 88)
    // A laptop's or an unknown model's: none, so no color.
    assert.equal(Sys.cpuPowerLimit("AMD Ryzen 7 7840HS w/ Radeon 780M Graphics", null), null)
    assert.equal(Sys.cpuPowerLimit("", null), null)
  },
  "parseSensors finds the CPU temperature, fans and NVMe temperatures"() {
    const sections = Proc.parseFrame(frame(0, [0]))
    const sensors = Sys.parseSensors(sections.hwmon, sections.nvme)
    assert.equal(sensors.cpuTemp, 67.375)
    assert.deepEqual(plain(sensors.fans), [{ name: "CPU fan", rpm: 1210 }])
    assert.deepEqual(plain(sensors.nvme), { nvme0: 34.85, nvme1: 42.85 })
    // coretemp names its package, other chips their first sensor.
    assert.equal(Sys.parseSensors(["coretemp\ttemp2\tCore 0\t50000", "coretemp\ttemp1\tPackage id 0\t55000"], []).cpuTemp, 55)
    assert.equal(Sys.parseSensors(["cpu_thermal\ttemp1\t\t48000"], []).cpuTemp, 48)
    assert.equal(Sys.parseSensors([], []).cpuTemp, null)
  },
  "parseSensors names the CPU dies and memory modules for the sensors panel"() {
    const sections = Proc.parseFrame(frame(0, [0]))
    const sensors = Sys.parseSensors(sections.hwmon, sections.nvme)
    assert.deepEqual(plain(sensors.temps), [
      { name: "CPU", temp: 67.375, limit: 95 }, { name: "CCD 1", temp: 65.5, limit: 95 },
      { name: "DIMM 1", temp: 58, limit: 85 }, { name: "DIMM 2", temp: 56.25, limit: 85 }
    ])
    // Intel's per-core sensors stay out; its package is the CPU.
    const intel = Sys.parseSensors(["coretemp\ttemp1\tPackage id 0\t55000", "coretemp\ttemp2\tCore 0\t50000"], [])
    assert.deepEqual(plain(intel.temps), [{ name: "CPU", temp: 55, limit: 100 }])
  },
}

run(tests)
