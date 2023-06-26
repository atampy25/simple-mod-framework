import fs from "fs-extra"
import { logger } from "./core-singleton"
import path from "path"
import ts from "typescript"

export async function compile(fileNames: string[], options: ts.CompilerOptions, rootDir: string) {
	fs.ensureDirSync(path.join(process.cwd(), "compiled"))

	const program = ts.createProgram(fileNames, options)
	const result = program.emit(undefined, (filename, data) => {
		fs.ensureDirSync(path.join(process.cwd(), "compiled", path.dirname(path.relative(rootDir, filename))))
		fs.writeFileSync(path.join(process.cwd(), "compiled", path.relative(rootDir, filename)), data)

		delete require.cache[require.resolve(path.join(process.cwd(), "compiled", path.relative(rootDir, filename)))]
	})

	if (result.emitSkipped) {
		await logger.error(`Failed to transpile [${fileNames.join(", ")}]! Diagnostics:${result.diagnostics.map((a) => `- ${a.messageText}`).join("\n")}`)
	}
}
