import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

type ScriptsType = { [key: string]: string };

// Activation function
export async function activate(context: vscode.ExtensionContext) {
  const configureScriptsCommand = vscode.commands.registerCommand(
    "quickscriptbar.configureScripts",
    () => configureScripts(context)
  );

  const runScriptCommand = vscode.commands.registerCommand(
    "quickscriptbar.runScript",
    (script: string, context: vscode.ExtensionContext) =>
      runScript(script, context)
  );

  const getPackageManagerCommand = vscode.commands.registerCommand(
    "quickscriptbar.getPackageManager",
    () => getPackageManager(context)
  );

  context.subscriptions.push(
    configureScriptsCommand,
    runScriptCommand,
    getPackageManagerCommand
  );
  await initialScripts(context);
}

// Main function to configure scripts

async function configureScripts(context: vscode.ExtensionContext) {
  const manager = context.workspaceState.get("qsb_saved_manager");
  try {
    const initials = await initialScripts(context);
    if (!manager) {
      const selectManager = await getPackageManager(context);
      if (!selectManager) {
        return;
      }
    }

    const selectedScripts = await selectScriptsFromPackageJson(
      initials.packageJsonScripts,
      initials.preSelectedScripts
    );
    if (!selectedScripts) {
      return;
    }

    saveScripts(context, selectedScripts);
    updateStatusBar(selectedScripts, initials.packageJsonScripts, context);
  } catch (error) {
    console.error("Error in configureScripts:", error);
  }
}

// Helper functions

async function getPackageManager(context: vscode.ExtensionContext) {
  // Select package manager
  const managers = ["npm", "yarn", "pnpm"];
  const selectedManager = await vscode.window.showQuickPick(managers, {
    placeHolder: "Select package manager",
  });

  if (!selectedManager) {
    return;
  }

  // Select whether to include "run" command
  const runOptions = ["Include 'run' command", "Don't include 'run' command"];
  const runOption = await vscode.window.showQuickPick(runOptions, {
    placeHolder: "Should the command include 'run'?",
  });

  const includeRun = runOption === runOptions[0];

  context.workspaceState.update("qsb_saved_manager", selectedManager);
  context.workspaceState.update("qsb_include_run", includeRun);

  return selectedManager;
}

async function initialScripts(context: vscode.ExtensionContext) {
  const workspaceFolder = getWorkspaceFolder();
  const packageJsonScripts = await readPackageJson(workspaceFolder);
  const preSelectedScripts = getPreSelectedScripts(context);

  if (preSelectedScripts.length) {
    updateStatusBar(preSelectedScripts, packageJsonScripts, context);
  }
  return { packageJsonScripts, preSelectedScripts };
}

function getWorkspaceFolder(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found!");
    throw new Error("No workspace folder found!");
  }
  return workspaceFolder;
}

async function readPackageJson(workspaceFolder: string): Promise<ScriptsType> {
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

  return packageJson.scripts;
}

function getPreSelectedScripts(context: vscode.ExtensionContext): string[] {
  return context.workspaceState.get("savedScripts", []);
}

async function selectScriptsFromPackageJson(
  scripts: ScriptsType,
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
  allScripts: ScriptsType,
  context: vscode.ExtensionContext
) {
  clearStatusBarItems(context, allScripts);
  selectedScripts.forEach((scriptName) => {
    const scriptCommand = allScripts[scriptName];
    const statusBarItem = createStatusBarItem(
      scriptName,
      scriptCommand,
      context
    );
    context.subscriptions.push(statusBarItem);
  });
}

function clearStatusBarItems(
  context: vscode.ExtensionContext,
  allScripts: ScriptsType
) {
  context.subscriptions.filter((sub: any) => {
    const allScriptArr = Object.entries(allScripts).map((item) => item[0]);
    if (sub.k && allScriptArr.includes(sub.k.split(" ")[1])) {
      sub.dispose();
      return false;
    }
    return true;
  });
}

function createStatusBarItem(
  script: string,
  scriptCommand: string,
  context: vscode.ExtensionContext
): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = `$(terminal) ${script}`;
  statusBarItem.tooltip = scriptCommand;
  statusBarItem.command = {
    command: "quickscriptbar.runScript",
    arguments: [script, context],
    title: `Run ${script}`,
  };
  statusBarItem.show();
  return statusBarItem;
}

function runScript(script: string, context: vscode.ExtensionContext) {
  const manager = context.workspaceState.get("qsb_saved_manager");
  if (!manager) {
    getPackageManager(context);
    return;
  }

  const includeRun = context.workspaceState.get("qsb_include_run", true); // Default to true for backward compatibility

  const terminalName = `Run Script: ${script}`;
  let terminal = vscode.window.terminals.find((t) => t.name === terminalName);

  if (!terminal) {
    terminal = vscode.window.createTerminal({
      name: terminalName,
    });
  }

  const command = includeRun
    ? `${manager} run ${script}`
    : `${manager} ${script}`;
  terminal.sendText(command);
  terminal.show();
}
