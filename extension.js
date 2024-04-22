const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const outputChannel = vscode.window.createOutputChannel("SyncOpener");
let isExtensionTriggered = false;

function log(message) {
	const timestamp = new Date().toLocaleTimeString();
	outputChannel.appendLine(`[${timestamp}] ${message}`);
}

const fileFormatFunctions = {
	"camel-case": (str) => str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase()),
	"pascal-case": (str) => str.replace(/(^|[^a-zA-Z0-9]+)(.)/g, (_, __, chr) => chr.toUpperCase()),
	"kebab-case": (str) =>
		str
			.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
			.replace(/[\s_]+/g, "-")
			.toLowerCase(),
	"snake-case": (str) =>
		str
			.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
			.replace(/[\s\-]+/g, "_")
			.toLowerCase()
};

function detectFileNameType(fileName) {
	const regexes = {
		"camel-case": /^[a-z][a-zA-Z]*\.\w+$/,
		"pascal-case": /^[A-Z][a-zA-Z]*\.\w+$/,
		"kebab-case": /^[a-z]+(-[a-z]+)*\.\w+$/,
		"snake-case": /^[a-z]+(_[a-z]+)*\.\w+$/
	};
	const matches = fileName.match(/^[^a-zA-Z0-9]*(?=[a-zA-Z])/);
	const prefix = (matches && matches[0]) || "";

	const cleanFileName = fileName.slice(prefix.length);

	for (const [format, regex] of Object.entries(regexes)) {
		if (regex.test(cleanFileName)) {
			return { prefix, format };
		}
	}
	return { prefix, format: "unknown" };
}

function convertFileName(fileName, sourceFormat, targetFormat, targetExtension) {
	// Ensure we remove the extension correctly by subtracting the extension's length
	const extensionLength = path.extname(fileName).length;
	const baseName = fileName.slice(0, -extensionLength); // Now we subtract the exact length of the extension

	let convertedName = sourceFormat.prefix ? baseName.slice(sourceFormat.prefix.length) : baseName;

	// Log the baseName to verify it's correct
	log(`Base name without extension: ${baseName}`);

	const convertFunction = fileFormatFunctions[targetFormat.format] || (() => baseName);
	convertedName = convertFunction(convertedName);

	// Log the convertedName to verify the transformation
	log(`Converted name before adding extension: ${convertedName}`);

	if (targetFormat.prefix) {
		convertedName = targetFormat.prefix + convertedName;
	}

	// Log the final filename before return
	log(`Final converted name with extension: ${convertedName + targetExtension}`);

	return `${convertedName}${targetExtension}`;
}

async function activate(context) {
	let disposable = vscode.workspace.onDidOpenTextDocument(async (document) => {
		if (isExtensionTriggered) {
			log(`Skipped opening by extension: ${document.uri.fsPath}`);
			return;
		}

		const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;

		if (!rootPath) return;

		const syncFilePath = path.join(rootPath, ".syncopener");
		if (!fs.existsSync(syncFilePath)) {
			log("No .syncopener file found, skipping.");
			return;
		}

		let directoryPairs;
		try {
			directoryPairs = JSON.parse(fs.readFileSync(syncFilePath, "utf8"));
		} catch (error) {
			log(`Error reading .syncopener file: ${error}`);
			return;
		}

		let documentName = document.uri.fsPath.replace(/\.git$/, "");
		log(`Processing ${documentName}...`);

		const fileExtension = path.extname(documentName);
		if (![".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss"].includes(fileExtension)) {
			return;
		}

		// Save the active editor before any operations
		const originalEditor = vscode.window.activeTextEditor;

		for (const pair of directoryPairs) {
			const directory1 = pair.directory1.path;
			const directory2 = pair.directory2.path;
			const targetDirectory = documentName.includes(directory1) ? directory2 : documentName.includes(directory2) ? directory1 : null;
			if (!targetDirectory) continue;

			const targetExtension = documentName.includes(directory1) ? pair.directory2.extension || fileExtension : pair.directory1.extension || fileExtension;
			const openedFileName = path.basename(documentName, fileExtension);
			log(`Opened file name without extension: ${openedFileName}`);

			const sourceFormat = detectFileNameType(openedFileName + fileExtension);
			const targetFormat = documentName.includes(directory1) ? pair.directory2.fileFormat || sourceFormat : pair.directory1.fileFormat || sourceFormat;

			const convertedFileName = convertFileName(openedFileName + fileExtension, sourceFormat, targetFormat, targetExtension);

			const targetFilePath = path.join(rootPath, targetDirectory, convertedFileName);
			log(`Trying to open file: ${targetFilePath}`);

			if (vscode.window.visibleTextEditors.some((editor) => editor.document.uri.fsPath === targetFilePath)) {
				log(`File already open: ${targetFilePath}`);
				continue;
			}

			try {
				isExtensionTriggered = true;
				const targetDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFilePath));
				await vscode.window.showTextDocument(targetDocument, { viewColumn: vscode.ViewColumn.Two, preserveFocus: true });
				log(`Opened ${convertedFileName} in column two.`);
			} catch (error) {
				log(`File not found: ${targetFilePath} - ${error}`);
			} finally {
				setTimeout(() => {
					isExtensionTriggered = false;
					if (originalEditor) {
						vscode.window.showTextDocument(originalEditor.document, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
					}
				}, 100);
			}
		}
	});

	context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
};
