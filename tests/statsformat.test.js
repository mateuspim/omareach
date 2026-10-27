import assert from "node:assert/strict"
import { plain, palette, Format, run } from "./statsfixtures.js"

// StatsFormat.js: the palette, heat levels and text forms of numbers.

const tests = {
  "heat fills a meter from room temperature to the limit"() {
    assert.equal(Format.heat(30, 95), 0)
    assert.equal(Format.heat(95, 95), 1)
    assert.equal(Format.heat(62.5, 95), 0.5)
    assert.equal(Format.heat(20, 95), 0)
    assert.equal(Format.heat(null, 95), 0)
    // No usable limit reads as 100 °C.
    assert.equal(Format.heat(65, null), 0.5)
  },
  "coreGroups splits a hybrid CPU's threads by kind"() {
    assert.deepEqual(plain(Format.cpuList("0-3,8,10-11")), [0, 1, 2, 3, 8, 10, 11])
    assert.deepEqual(plain(Format.cpuList("")), [])
    assert.deepEqual(plain(Format.coreGroups({ cpu_core: "0-15", cpu_atom: "16-23" })), {
      performance: [...Array(16).keys()], efficient: [16, 17, 18, 19, 20, 21, 22, 23]
    })
    assert.equal(Format.coreGroups({ cpu_core: "0-15" }), null)
    assert.equal(Format.coreGroups(null), null)
  },
  "formatDuration and formatUptime"() {
    assert.equal(Format.formatDuration(83), "1:23")
    assert.equal(Format.formatDuration(3723), "1:02:03")
    assert.equal(Format.formatDuration(null), "—")
    assert.equal(Format.formatUptime(35458.33), "9h 50m")
    assert.equal(Format.formatUptime(200000), "2d 7h")
    assert.equal(Format.formatUptime(300), "5m")
  },
  "parseColors reads an Omarchy colors.toml"() {
    const colors = Format.parseColors('mode = "dark"\naccent = "#81a1c1"\n# red = "#000000"\nred = "#BF616A"\ncolor2 = \'#a3be8c\'\n')
    assert.deepEqual(plain(colors), { accent: "#81a1c1", red: "#bf616a", color2: "#a3be8c" })
  },
  "palette builds btop-style gradients from the theme's named colors"() {
    const palette = Format.palette({ foreground: "#d8dee9", background: "#2e3440", accent: "#81a1c1", muted: "#4c566a", red: "#bf616a", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#88c0d0", blue: "#81a1c1", magenta: "#b48ead", orange: "#d5967a" })
    assert.deepEqual(plain(palette.gradients.cpu), ["#88c0d0", "#81a1c1", "#b48ead"])
    assert.deepEqual(plain(palette.gradients.level), ["#a3be8c", "#a3be8c", "#ebcb8b", "#bf616a"])
    assert.equal(palette.alert, "#bf616a")
    assert.equal(palette.boxes.cpu, "#b48ead")
    assert.equal(palette.boxes.memory, "#a3be8c")
    assert.equal(palette.foreground, "#d8dee9")
    assert.equal(palette.line, "#4c566a")
  },
  "palette falls back to the numbered colors, then the foreground"() {
    const palette = Format.palette({ color0: "#000000", color1: "#aa0000", color2: "#00aa00", color3: "#aaaa00", color4: "#0000aa", color5: "#aa00aa", color6: "#00aaaa", color7: "#cccccc", color8: "#555555" })
    assert.deepEqual(plain(palette.gradients.level), ["#00aa00", "#00aa00", "#aaaa00", "#aa0000"])
    assert.equal(palette.foreground, "#cccccc")
    assert.equal(palette.line, "#555555")
    // orange falls back to yellow.
    assert.equal(palette.gradients.download[1], "#aaaa00")
    const bare = Format.palette({}, { foreground: "#eeeeee", accent: "#3366ff" })
    assert.equal(bare.boxes.gpu, "#3366ff")
    assert.deepEqual(plain(bare.gradients.cpu), ["#3366ff", "#3366ff", "#3366ff"])
  },
  "gradientAt mixes the stops"() {
    const stops = ["#000000", "#808080", "#ffffff"]
    assert.equal(Format.gradientAt(stops, 0), "#000000")
    assert.equal(Format.gradientAt(stops, 0.5), "#808080")
    assert.equal(Format.gradientAt(stops, 0.25), "#404040")
    assert.equal(Format.gradientAt(stops, 2), "#ffffff")
    assert.equal(Format.gradientAt(stops, -1), "#000000")
  },
  "formatters"() {
    assert.equal(Format.formatBytes(0), "0 B")
    assert.equal(Format.formatBytes(1536), "1.5 KiB")
    assert.equal(Format.formatBytes(7551 * 1048576), "7.4 GiB")
    assert.equal(Format.formatBytes(150 * 1048576), "150 MiB")
    assert.equal(Format.formatRate(2048), "2.0 KiB/s")
    assert.equal(Format.formatRate(null), "—")
    assert.equal(Format.formatPercent(54.6), "55%")
    assert.equal(Format.formatPercent(null), "—")
    assert.equal(Format.formatTemp(67.375), "67°C")
    assert.equal(Format.formatTemp(null), "—")
    assert.equal(Format.formatFrequency(5099.8), "5.10 GHz")
    assert.equal(Format.formatFrequency(800), "800 MHz")
    assert.equal(Format.formatShort(0), "0")
    assert.equal(Format.formatShort(958464), "936K")
    assert.equal(Format.formatShort(2.1 * 1048576), "2.1M")
    assert.equal(Format.formatShort(null), "—")
  },
}

run(tests)
