// Runs `tests` ({ name: function }) and exits non-zero if any failed.
export function run(tests) {
  let failed = 0
  for (const [name, test] of Object.entries(tests)) {
    try { test(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
  }
  process.exit(failed ? 1 : 0)
}
