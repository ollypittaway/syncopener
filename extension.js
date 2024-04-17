const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const outputChannel = vscode.window.createOutputChannel("My Extension");

async function activate(context) {
	let disposable = vscode.workspace.onDidOpenTextDocument(async (document) => {
		let documentName = document.uri.fsPath;
		if (documentName.endsWith(".git")) {
			documentName = documentName.substring(0, documentName.length - 4);
		}

		const validExtensions = [".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss"];
		if (!validExtensions.some((ext) => documentName.endsWith(ext))) return;

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return; // Exit if no workspace is opened
		}

		const rootPath = workspaceFolders[0].uri.fsPath;
		const syncFilePath = path.join(rootPath, ".syncopener");
		let directoryPairs = [];

		if (fs.existsSync(syncFilePath)) {
			try {
				const data = fs.readFileSync(syncFilePath, "utf8");
				directoryPairs = JSON.parse(data);
			} catch (error) {
				return;
			}
		} else {
			outputChannel.appendLine(`${new Date().getTime()} .syncopener does not exist, skipping...`);
			return; // Exit if the .syncopener file does not exist
		}

		let openedFilePath = documentName;
		let openedFileName = path.basename(openedFilePath);
		const originalEditor = vscode.window.activeTextEditor;

		for (const pair of directoryPairs) {
			const directory1 = pair.directory1.path;
			const directory2 = pair.directory2.path;
			const directory1Extension = pair.directory1.extension || "";
			const directory2Extension = pair.directory2.extension || "";

			if (openedFilePath.includes(directory1) || openedFilePath.includes(directory2)) {
				let targetDirectory = openedFilePath.includes(directory1) ? directory2 : directory1;
				let targetExtension = openedFilePath.includes(directory1) ? directory2Extension : directory1Extension;

				if (targetExtension && !openedFilePath.endsWith(targetExtension)) {
					let currentExtension = path.extname(openedFilePath);
					openedFileName = openedFileName.replace(currentExtension, targetExtension);
				}

				const targetFilePath = path.join(rootPath, targetDirectory, openedFileName);
				const targetUri = vscode.Uri.file(targetFilePath);

				const targetDocument = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === targetUri.fsPath);

				if (targetDocument && !vscode.window.visibleTextEditors.some((editor) => editor.document.uri.fsPath === targetUri.fsPath)) {
					await vscode.window.showTextDocument(targetDocument, { viewColumn: vscode.ViewColumn.Beside });
				} else if (!targetDocument) {
					try {
						const openedTargetDocument = await vscode.workspace.openTextDocument(targetUri);
						await vscode.window.showTextDocument(openedTargetDocument, { viewColumn: vscode.ViewColumn.Beside });
					} catch (error) {
						console.error(`File not found: ${targetFilePath}`);
					}
				}

				if (originalEditor) {
					await vscode.window.showTextDocument(originalEditor.document, { viewColumn: originalEditor.viewColumn });
				}

				break; // Exit the loop after finding the matching directory
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
