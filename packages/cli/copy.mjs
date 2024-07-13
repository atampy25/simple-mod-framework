import { copyFile, access, mkdir } from "node:fs/promises"

await access("./compiled").catch(() => mkdir("compiled"))
copyFile("../rust/rust.win32-x64-msvc.node", "./compiled/smf-rust.node")
copyFile("../rust/index.d.ts", "./compiled/smf-rust.d.ts")
