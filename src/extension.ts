import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface PackageJson {
  scripts: { [key: string]: string };
}

// Activation function
export function activate(context: vscode.ExtensionContext) {
  const configureScriptsCommand = vscode.commands.registerCommand(
    "quickscriptbar.configureScripts",
    () => configureScripts(context)
  );

  const runScriptCommand = vscode.commands.registerCommand(
    "quickscriptbar.runScript",
    (script: string) => runScript(script)
  );

  context.subscriptions.push(configureScriptsCommand, runScriptCommand);
}

// Main function to configure scripts
async function configureScripts(context: vscode.ExtensionContext) {
  try {
    const workspaceFolder = getWorkspaceFolder();
    const packageJson = await readPackageJson(workspaceFolder);
    const preSelectedScripts = getPreSelectedScripts(context);

    if (preSelectedScripts.length) {
      updateStatusBar(preSelectedScripts, packageJson.scripts, context);
    }

    const selectedScripts = await selectScriptsFromPackageJson(
      packageJson.scripts,
      preSelectedScripts
    );
    if (!selectedScripts) {
      return;
    }

    saveScripts(context, selectedScripts);
    updateStatusBar(selectedScripts, packageJson.scripts, context);
  } catch (error) {
    console.error("Error in configureScripts:", error);
  }
}

// Helper functions
function getWorkspaceFolder(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found!");
    throw new Error("No workspace folder found!");
  }
  return workspaceFolder;
}

async function readPackageJson(workspaceFolder: string): Promise<PackageJson> {
  const packageJsonPath = path.join(workspaceFolder, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    vscode.window.showErrorMessage("No package.json found in the workspace!");
    throw new Error("No package.json found in the workspace!");
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!packageJson.scripts) {
    vscode.window.showErrorMessage("No scripts found in package.json!");
    throw new Error("No scripts found in package.json!");
  }

  return packageJson;
}

function getPreSelectedScripts(context: vscode.ExtensionContext): string[] {
  return context.workspaceState.get("savedScripts", []);
}

async function selectScriptsFromPackageJson(
  scripts: { [key: string]: string },
  preSelectedScripts: string[]
): Promise<string[] | undefined> {
  const scriptNames = Object.keys(scripts);
  return await selectScripts(scriptNames, preSelectedScripts);
}

async function selectScripts(
  scriptNames: string[],
  preSelectedScripts: string[]
): Promise<string[] | undefined> {
  const quickPick = vscode.window.createQuickPick();
  quickPick.canSelectMany = true;
  quickPick.items = scriptNames.map((label) => ({ label }));
  quickPick.selectedItems = quickPick.items.filter((item) =>
    preSelectedScripts.includes(item.label)
  );

  quickPick.placeholder = "Select scripts to add to the Status Bar";

  return new Promise((resolve) => {
    quickPick.onDidAccept(() => {
      resolve(quickPick.selectedItems.map((item) => item.label));
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      resolve(undefined);
      quickPick.dispose();
    });
    quickPick.show();
  });
}

function saveScripts(
  context: vscode.ExtensionContext,
  selectedScripts: string[]
) {
  context.workspaceState.update("savedScripts", selectedScripts);
}

function updateStatusBar(
  selectedScripts: string[],
  allScripts: { [key: string]: string },
  context: vscode.ExtensionContext
) {
  clearStatusBarItems(context);
  selectedScripts.forEach((scriptName) => {
    const scriptCommand = allScripts[scriptName];
    const statusBarItem = createStatusBarItem(scriptName, scriptCommand);
    context.subscriptions.push(statusBarItem);
  });
}

function clearStatusBarItems(context: vscode.ExtensionContext) {
  context.subscriptions.filter((sub: any) => {
    if (sub.k) {
      sub.dispose();
      return false;
    }
    return true;
  });
}

function createStatusBarItem(
  script: string,
  scriptCommand: string
): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = `$(terminal) ${script}`;
  statusBarItem.tooltip = scriptCommand;
  statusBarItem.command = {
    command: "quickscriptbar.runScript",
    arguments: [script],
    title: `Run ${script}`,
  };
  statusBarItem.show();
  return statusBarItem;
}

function runScript(script: string) {
  const terminal = vscode.window.createTerminal({
    name: `Run Script: ${script}`,
  });
  terminal.sendText(`npm run ${script}`);
  terminal.show();
}
