const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const outputChannel = vscode.window.createOutputChannel("SyncOpener");

let isExtensionTriggered = false; // Global flag to indicate if the opening is triggered by the extension

// Function to detect the name type of the file
function DetectNameType(fileName) {
	const camelCaseRegex = /^[a-z][a-zA-Z]*\.\w+$/;
	const pascalCaseRegex = /^[A-Z][a-zA-Z]*\.\w+$/;
	const kebabCaseRegex = /^[a-z]+(-[a-z]+)*\.\w+$/;
	const snakeCaseRegex = /^[a-z]+(_[a-z]+)*\.\w+$/;

	const prefixMatch = fileName.match(/^[^a-zA-Z0-9]*(?=[a-zA-Z])/);
	const prefix = prefixMatch ? prefixMatch[0] : "";

	const cleanFileName = fileName.slice(prefix.length);
	let format;
	if (camelCaseRegex.test(cleanFileName)) {
		format = "camel-case";
	} else if (pascalCaseRegex.test(cleanFileName)) {
		format = "pascal-case";
	} else if (kebabCaseRegex.test(cleanFileName)) {
		format = "kebab-case";
	} else if (snakeCaseRegex.test(cleanFileName)) {
		format = "snake-case";
	} else {
		format = "unknown";
	}

	return {
		prefix: prefix,
		format: format
	};
}

// Modified ConvertToFileFormat function to handle optional fileFormat
function ConvertToFileFormat(fileName, sourceFileFormat, targetFileFormat, targetExtension) {
	Log("Converting file name to target format");

	const nameParts = fileName.split(".");
	const baseName = nameParts.slice(0, -1).join(".");

	Log("SourceFIleFormat: " + JSON.stringify(sourceFileFormat));
	Log("TargetFileFormat: " + JSON.stringify(targetFileFormat));

	if (sourceFileFormat.format === targetFileFormat.format && sourceFileFormat.prefix === targetFileFormat.prefix) {
		return fileName; // No change needed if already matching format and prefix
	}

	let convertedName = sourceFileFormat.prefix ? baseName.substring(sourceFileFormat.prefix.length) : baseName;

	// Convert to the target format
	switch (targetFileFormat.format) {
		case "camel-case":
			convertedName = convertToCamelCase(convertedName);
			break;
		case "pascal-case":
			convertedName = convertToPascalCase(convertedName);
			break;
		case "kebab-case":
			convertedName = convertToKebabCase(convertedName);
			break;
		case "snake-case":
			convertedName = convertToSnakeCase(convertedName);
			break;
		default:
			Log("Unknown or unprovided target format, using original");
			return fileName; // Return original if target format is unknown or not provided
	}

	// Add target prefix if specified
	if (targetFileFormat.prefix) {
		convertedName = targetFileFormat.prefix + convertedName;
	}

	return `${convertedName}${targetExtension}`;
}

function convertToCamelCase(str) {
	Log("Converting to camel case");
	return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
}

function convertToPascalCase(str) {
	Log("Converting to pascal case");
	return str.replace(/(^|[^a-zA-Z0-9]+)(.)/g, (m, pre, chr) => chr.toUpperCase());
}

function convertToKebabCase(str) {
	Log("Converting to kebab case");
	return str
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[\s_]+/g, "-")
		.toLowerCase();
}

function convertToSnakeCase(str) {
	Log("Converting to snake case");
	return str
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[\s\-]+/g, "_")
		.toLowerCase();
}

// Updates in the activate function to handle optional fileFormat
async function activate(context) {
	let disposable = vscode.workspace.onDidOpenTextDocument(async (document) => {
		if (isExtensionTriggered) {
			Log(`Skipping document opened by the extension: ${document.uri.fsPath}`);
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return;
		}

		let documentName = document.uri.fsPath;
		if (documentName.endsWith(".git")) {
			documentName = documentName.replace(".git", "");
		}

		const validExtensions = [".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss"];
		const fileExtension = path.extname(documentName).toLowerCase();

		if (!validExtensions.includes(fileExtension)) {
			return;
		}

		const rootPath = workspaceFolders[0].uri.fsPath;
		const syncFilePath = path.join(rootPath, ".syncopener");
		let directoryPairs = [];

		if (fs.existsSync(syncFilePath)) {
			try {
				const data = fs.readFileSync(syncFilePath, "utf8");
				directoryPairs = JSON.parse(data);
			} catch (error) {
				Log("Error reading .syncopener file - " + error);
				return;
			}
		} else {
			Log("No .syncopener file found, skipping.");
			return;
		}

		let openedFilePath = documentName;
		const originalEditor = vscode.window.activeTextEditor;

		Log(`Working on ${openedFilePath}...`);

		for (const pair of directoryPairs) {
			const directory1 = pair.directory1.path;
			const directory2 = pair.directory2.path;
			const directory1Extension = pair.directory1.extension || path.extname(openedFilePath);
			const directory2Extension = pair.directory2.extension || path.extname(openedFilePath);
			const directory1FileFormat = pair.directory1.fileFormat || DetectNameType(path.basename(openedFilePath, path.extname(openedFilePath)) + directory1Extension);
			const directory2FileFormat = pair.directory2.fileFormat || DetectNameType(path.basename(openedFilePath, path.extname(openedFilePath)) + directory2Extension);

			let targetDirectory, targetExtension, targetFileFormat;

			if (openedFilePath.includes(directory1)) {
				targetDirectory = directory2;
				targetExtension = directory2Extension;
				targetFileFormat = directory2FileFormat;
			} else if (openedFilePath.includes(directory2)) {
				targetDirectory = directory1;
				targetExtension = directory1Extension;
				targetFileFormat = directory1FileFormat;
			} else {
				continue;
			}

			Log(`Looking in ${targetDirectory} for ${targetExtension} files...`);

			let openedFileName = path.basename(openedFilePath, path.extname(openedFilePath)) + targetExtension;
			let sourceFileFormat = DetectNameType(openedFileName);

			Log(`Target file format: ${JSON.stringify(targetFileFormat)}`);

			const converted = ConvertToFileFormat(openedFileName, sourceFileFormat, targetFileFormat, targetExtension);

			Log("This is the converted file name: " + converted);

			// After the file name has been converted
			const convertedNameType = DetectNameType(converted); // Detect name type of the converted file

			if (convertedNameType.format !== targetFileFormat.format || (targetFileFormat.prefix && !convertedNameType.prefix.startsWith(targetFileFormat.prefix))) {
				Log(`File ${converted} does not match target format or prefix`);
				continue;
			}

			let targetFilePath = path.join(rootPath, targetDirectory, converted); // Changed from openedFileName to converted
			const targetUri = vscode.Uri.file(targetFilePath);

			if (isFileAlreadyOpen(targetFilePath)) {
				Log(`File already open: ${targetFilePath}`);
				const editor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.fsPath === targetFilePath);
				if (editor) {
					vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
				}
				return;
			}

			try {
				isExtensionTriggered = true;
				Log("Extension triggered flag set");
				const targetDocument = await vscode.workspace.openTextDocument(targetUri);
				await vscode.window.showTextDocument(targetDocument, { viewColumn: vscode.ViewColumn.Two });
			} catch (error) {
				console.error(`File not found: ${targetFilePath}`);
			} finally {
				setTimeout(() => {
					isExtensionTriggered = false;
					Log("Extension triggered flag reset");
				}, 100);
			}

			if (originalEditor) {
				await vscode.window.showTextDocument(originalEditor.document, { viewColumn: vscode.ViewColumn.One });
			}

			break;
		}
		Log("\n\n========================\n\n", false);
	});

	context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
};

function Log(message, dateShown = true) {
	const date = new Date();
	const prettyDate = `${date.getDate()}-${date.getMonth()}-${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
	if (dateShown) {
		outputChannel.appendLine(`============ ${prettyDate} ============`);
		outputChannel.appendLine(message);
	} else {
		outputChannel.appendLine(`${message}`);
	}
}

function isFileAlreadyOpen(filePath) {
	return vscode.window.visibleTextEditors.some((editor) => editor.document.uri.fsPath === filePath);
}
