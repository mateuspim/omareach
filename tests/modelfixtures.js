import { load } from "./qmljs.js"

export { run } from "./run.js"

// The model scripts are QML `.pragma library` scripts, each given the
// modules its `.import` lines name.
export const Model = load("Model.js")
export const Art = load("ModelArt.js", { Model })
export const Edges = load("ModelEdges.js", { Model })
export const Profiles = load("ModelProfiles.js", { Model })
