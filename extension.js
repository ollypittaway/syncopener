const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const outputChannel = vscode.window.createOutputChannel("SyncOpener");

let isExtensionTriggered = false; // Global flag to indicate if the opening is triggered by the extension

async function activate(context) {
	let disposable = vscode.workspace.onDidOpenTextDocument(async (document) => {
		if (isExtensionTriggered) {
			Log(`Skipping document opened by the extension: ${document.uri.fsPath}`);

			return;
		} // Skip processing if the document is opened by the extension

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return; // Exit if no workspace is opened
		}

		let documentName = document.uri.fsPath;

		if (documentName.endsWith(".git")) {
			documentName = documentName.replace(".git", ""); // Remove .git from the file name
		}

		const validExtensions = [".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss"];

		const fileExtension = path.extname(documentName).toLowerCase(); // Handle extensions in a case-insensitive manner

		if (!validExtensions.includes(fileExtension)) {
			return;
		}

		Log(`Checking file with extension: ${fileExtension}`);

		Log(`All checks passed`);

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
			return; // Exit if the .syncopener file does not exist
		}

		let openedFilePath = documentName;
		const originalEditor = vscode.window.activeTextEditor; // Keep reference to the original editor

		Log(`Working on ${openedFilePath}...`);

		for (const pair of directoryPairs) {
			const directory1 = pair.directory1.path;
			const directory2 = pair.directory2.path;
			const directory1Extension = pair.directory1.extension || path.extname(openedFilePath); // Default to the file's current extension
			const directory2Extension = pair.directory2.extension || path.extname(openedFilePath);

			let targetDirectory, targetExtension;

			if (openedFilePath.includes(directory1)) {
				targetDirectory = directory2;
				targetExtension = directory2Extension;
			} else if (openedFilePath.includes(directory2)) {
				targetDirectory = directory1;
				targetExtension = directory1Extension;
			} else {
				continue; // Skip if the file path does not include either directory
			}

			Log(`Looking in ${targetDirectory} for ${targetExtension} files...`);

			let openedFileName = path.basename(openedFilePath, path.extname(openedFilePath)) + targetExtension;

			let targetFilePath = path.join(rootPath, targetDirectory, openedFileName);
			const targetUri = vscode.Uri.file(targetFilePath);

			if (isFileAlreadyOpen(targetFilePath)) {
				Log(`File already open: ${targetFilePath}`);
				// Optionally, focus the editor where the file is open
				const editor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.fsPath === targetFilePath);
				if (editor) {
					vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
				}
				return; // Skip the opening process
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
					isExtensionTriggered = false; // Reset flag after operation
					Log("Extension triggered flag reset");
				}, 100);
			}

			if (originalEditor) {
				await vscode.window.showTextDocument(originalEditor.document, { viewColumn: vscode.ViewColumn.One });
			}

			break; // Exit the loop after finding the matching directory
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

const Log = (message, dateShown = true) => {
	const date = new Date();
	const prettyDate = `${date.getDate()}-${date.getMonth()}-${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
	if (dateShown) {
		outputChannel.appendLine(`${prettyDate} => ${message}`);
		return;
	}
	outputChannel.appendLine(`${message}`);
};

function isFileAlreadyOpen(filePath) {
	return vscode.window.visibleTextEditors.some((editor) => editor.document.uri.fsPath === filePath);
}
