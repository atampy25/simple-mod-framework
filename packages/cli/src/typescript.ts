import fs from "fs-extra"
import path from "path"
import ts from "typescript"

export function compile(fileNames: string[], options: ts.CompilerOptions, rootDir: string) {
	fs.ensureDirSync(path.join(process.cwd(), "compiled"))
	const program = ts.createProgram(fileNames, options)
	program.emit(undefined, (filename, data) => {
		fs.ensureDirSync(path.join(process.cwd(), "compiled", path.dirname(path.relative(rootDir, filename))))
		fs.writeFileSync(path.join(process.cwd(), "compiled", path.relative(rootDir, filename)), data)

		// rome-ignore lint/performance/noDelete: lmao
		delete require.cache[require.resolve(path.join(process.cwd(), "compiled", path.relative(rootDir, filename)))]
	})
}
