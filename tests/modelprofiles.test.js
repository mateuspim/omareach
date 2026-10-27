import assert from "node:assert/strict"
import { Profiles, run } from "./modelfixtures.js"

// ModelProfiles.js: monitor keys, profiles and automatic profiles.

const tests = {
  "profileName trims and bounds a typed name"() {
    assert.equal(Profiles.profileName("  Desk   setup "), "Desk setup")
    assert.equal(Profiles.profileName("   "), "")
    assert.equal(Profiles.profileName(undefined), "")
    assert.equal(Profiles.profileName("x".repeat(40)).length, 32)
  },
  "snapshot keeps only entries that say something"() {
    const shot = Profiles.snapshot({ A: { top: 300 }, B: {}, C: { fill: "logo" }, D: { enabled: true, top: 0 } })
    assert.deepEqual([...Object.keys(shot)].sort(), ["A", "C"])
    assert.equal(shot.A.top, 300)
    assert.equal(shot.A.fill, "black")
    assert.equal(shot.C.fill, "logo")
  },
  "sameOutputs treats a missing entry as the default"() {
    assert.ok(Profiles.sameOutputs({ A: { top: 300 } }, { A: { top: 300, enabled: true }, B: {} }))
    assert.ok(!Profiles.sameOutputs({ A: { top: 300 } }, { A: { top: 300 }, B: { left: 10 } }))
    assert.ok(!Profiles.sameOutputs({ A: { top: 300 } }, { A: { top: 300, enabled: false } }))
    assert.ok(Profiles.sameOutputs({}, undefined))
  },
  "profiles drops what is not a profile"() {
    const read = Profiles.profiles({ " Desk ": { A: { top: 300 } }, "": { A: {} }, Bad: 3, List: [], Empty: {} })
    assert.deepEqual([...Profiles.profileNames(read)], ["Desk", "Empty"])
    assert.equal(read.Desk.A.top, 300)
    assert.deepEqual({ ...Profiles.profiles(null) }, {})
    assert.deepEqual({ ...Profiles.profiles([1]) }, {})
  },
  "currentProfile finds the profile on screen"() {
    const profiles = { Gaming: { A: { top: 0, left: 200, right: 200 } }, Desk: { A: { top: 300 } }, Off: {} }
    assert.equal(Profiles.currentProfile(profiles, { A: { top: 300 } }), "Desk")
    assert.equal(Profiles.currentProfile(profiles, {}), "Off")
    assert.equal(Profiles.currentProfile(profiles, { A: { top: 310 } }), "")
    assert.equal(Profiles.currentProfile({}, {}), "")
  },
  "currentProfile prefers the last profile among equal ones"() {
    const profiles = { Alpha: { A: { top: 300 } }, Beta: { A: { top: 300 } } }
    assert.equal(Profiles.currentProfile(profiles, { A: { top: 300 } }), "Alpha")
    assert.equal(Profiles.currentProfile(profiles, { A: { top: 300 } }, "Beta"), "Beta")
    assert.equal(Profiles.currentProfile(profiles, { A: { top: 310 } }, "Beta"), "")
    assert.equal(Profiles.currentProfile(profiles, { A: { top: 300 } }, "Gone"), "Alpha")
  },
  "findProfile matches a name exactly, else ignoring case"() {
    const profiles = { Desk: {}, desk: {}, Gaming: {} }
    assert.equal(Profiles.findProfile(profiles, "desk"), "desk")
    assert.equal(Profiles.findProfile(profiles, " GAMING "), "Gaming")
    assert.equal(Profiles.findProfile(profiles, "Laptop"), "")
    assert.equal(Profiles.findProfile(profiles, ""), "")
  },
  "monitorSet lists the connected monitors' keys once, sorted"() {
    assert.deepEqual([...Profiles.monitorSet({ "DP-5": "LG 27", "DP-4": "Dell U27" })], ["Dell U27", "LG 27"])
    assert.deepEqual([...Profiles.monitorSet({})], [])
    assert.ok(Profiles.sameSet(["a", "b"], ["b", "a"]))
    assert.ok(!Profiles.sameSet(["a"], ["a", "b"]))
    assert.ok(Profiles.sameSet(undefined, []))
  },
  "autoProfiles keeps sets for profiles that exist"() {
    const profiles = { Docked: {}, Laptop: {} }
    const autos = Profiles.autoProfiles({ docked: ["B", "A", "A", ""], Laptop: [], Gone: ["A"], Bad: "A" }, profiles)
    assert.deepEqual(Object.keys(autos), ["Docked"])
    assert.deepEqual([...autos.Docked], ["A", "B"])
    assert.deepEqual({ ...Profiles.autoProfiles(null, profiles) }, {})
  },
  "autoProfileFor picks the profile tied to exactly these monitors"() {
    const autos = { Docked: ["A", "B"], Laptop: ["eDP-1"] }
    assert.equal(Profiles.autoProfileFor(autos, ["B", "A"]), "Docked")
    assert.equal(Profiles.autoProfileFor(autos, ["eDP-1"]), "Laptop")
    assert.equal(Profiles.autoProfileFor(autos, ["A"]), "")
    assert.equal(Profiles.autoProfileFor(autos, []), "")
  },
  "outputKeys prefers a unique description over the connector"() {
    const keys = Profiles.outputKeys([
      { name: "DP-4", description: "Dell Inc. DELL U2720Q 1A2B3C4" },
      { name: "DP-5", description: "" },
      { name: "HDMI-A-1", description: "Same Panel 0" },
      { name: "HDMI-A-2", description: "Same Panel 0" },
    ])
    assert.deepEqual({ ...keys }, { "DP-4": "Dell Inc. DELL U2720Q 1A2B3C4", "DP-5": "DP-5", "HDMI-A-1": "HDMI-A-1", "HDMI-A-2": "HDMI-A-2" })
  },
}

run(tests)
