import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'jsonc-parser'

// modified from https://github.com/Microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/multiStepInput.ts
/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 * 
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function themeMultiStep(context: vscode.ExtensionContext) {
	interface State {
		title: string;
		step: number;
		totalSteps: number;
		selectedTheme: vscode.QuickPickItem | string;
    selectedSyntax: vscode.QuickPickItem | string;
    saveOrDiscard: string;
		name: string;
  }
  
  const title = 'Mix VSCode Themes & Syntax';
  
  const availableThemesPackages = vscode.extensions.all.filter(e => {
    const { packageJSON } = e
    return packageJSON.contributes && 
           packageJSON.contributes.themes &&
           Array.isArray(packageJSON.contributes.themes) &&
           packageJSON.contributes.themes.length > 0
  }) as any[]

  type ITheme = { label: string, uiTheme: string, path: string, packagePath: string }

  const availableThemes: ITheme[] = availableThemesPackages.reduce((arr, pkg) => {
    // TODO: parse textmate theme
    // TODO: validate each theme json to include desire ui theme keys
    const themes = pkg.packageJSON.contributes.themes.map((theme: any) => ({...theme, packagePath: pkg.extensionPath}))
    return [...arr, ...themes]
  }, []).filter((pkg: ITheme) => pkg.path.includes('.json'))

  const themeLabels: vscode.QuickPickItem[] = availableThemes.map(({label}) => ({ label }))

	async function pickTheme (input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 3,
			placeholder: 'Select a theme to mix',
			items: themeLabels,
			activeItem: typeof state.selectedTheme !== 'string' ? state.selectedTheme : undefined,
			shouldResume: shouldResume
		});
		state.selectedTheme = pick;
		return (input: MultiStepInput) => pickSyntax(input, state);
  }

	async function pickSyntax (input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: 3,
			placeholder: 'Select a syntax to mix',
			items: themeLabels,
			activeItem: typeof state.selectedSyntax !== 'string' ? state.selectedSyntax : undefined,
			shouldResume: shouldResume
		});
    state.selectedSyntax = pick;
		return (input: MultiStepInput) => reviewSelection(input, state);
  }

  function stringifyLabel (item: vscode.QuickPickItem | string | undefined): string {
    if (typeof item === 'string') {
      return item
    } else {
      if (item && item.label) {
        return item.label
      } else {
        return ''
      }
    }
  }

  const reviewLabels = ['Save', 'Discard'].map(label => ({ label }))
  async function reviewSelection (input: MultiStepInput, state: Partial<State>) {
    const pick = await input.showQuickPick({
      title,
      step: 3,
      totalSteps: 3,
      items: reviewLabels,
      activeItem: undefined,
      placeholder: `Theme is [${stringifyLabel(state.selectedTheme)}] and syntax is [${stringifyLabel(state.selectedSyntax)}]`,
      shouldResume: shouldResume
    })

    state.saveOrDiscard = pick.label
  }

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {

		});
	}

	async function startSteps () {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => pickTheme(input, state));
		return state as State;
	}

  const { selectedTheme, selectedSyntax, saveOrDiscard } = await startSteps();

  if (saveOrDiscard === 'Discard') {
    return
  }

  const theme = stringifyLabel(selectedTheme)
  const syntax = stringifyLabel(selectedSyntax)

  // #region Set theme with syntax patch
  const editorConfig = vscode.workspace.getConfiguration('editor')
  const workbenchConfig = vscode.workspace.getConfiguration('workbench')
  const syntaxPackage = availableThemes.find(pkg => pkg.label === syntax)
  const uiThemePackage = availableThemes.find(pkg => pkg.label === theme)

  if (typeof syntaxPackage === 'undefined' || typeof uiThemePackage === 'undefined') {
    return
  }

  const currentTokenCustomizations = editorConfig.get('tokenColorCustomizations', {})
  const currentColorCustomizations =  workbenchConfig.get('colorCustomizations', {})
  const syntaxThemeRawString = readFileSync(join(syntaxPackage.packagePath, syntaxPackage.path)).toString('utf-8')
  const syntaxThemeJSON = parse(syntaxThemeRawString)
  const uiThemeRawString = readFileSync(join(uiThemePackage.packagePath, uiThemePackage.path)).toString('utf-8')
  const uiThemeJSON = parse(uiThemeRawString)

  const tokenPatch = {
    [`[${theme}]`]: {
      textMateRules: syntaxThemeJSON.tokenColors
    }
  }

  const uiPatchFromSyntax = Object.keys(syntaxThemeJSON.colors || {}).reduce((patch: any, key) => {
    if (key.match(/^(editor)/) && !key.includes('editorGroupHeader')) {
      const color = syntaxThemeJSON.colors[key]
      return { ...patch, [key]: color }
    } else {
      return patch
    }
  }, {})

  const uiPatchFromTheme = Object.keys(uiThemeJSON.colors || {}).reduce((patch: any, key) => {
    if (key.match(/^(tab)/)) {
      const color = uiThemeJSON.colors[key]
      return { ...patch, [key]: color }
    } else {
      return patch
    }
  }, {})

  const uiColorsPatch = {
    [`[${theme}]`]: {
      ...uiPatchFromSyntax,
      ...uiPatchFromTheme
    }
  }

  // TODO: update to global config when revert is done
  // TODO: stop applying update whenever error catched
  await workbenchConfig.update('colorTheme', theme, /* ConfigurationTarget.Global */)
  await editorConfig.update('tokenColorCustomizations', {...currentTokenCustomizations, ...tokenPatch})
  await workbenchConfig.update('colorCustomizations', {...currentColorCustomizations, ...uiColorsPatch})
  // #endregion

  const clicked = await vscode.window.showInformationMessage('Mixed Theme applied!', 'Revert')
  if (clicked && clicked === 'Revert') {
    // TODO: revert theme value
  }
}


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
	private constructor() { }
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends vscode.QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	activeItem?: T;
	placeholder: string;
	buttons?: vscode.QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: vscode.QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: vscode.QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends vscode.QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: vscode.Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = vscode.window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (activeItem) {
					input.activeItems = [activeItem];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [vscode.QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === vscode.QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
		const disposables: vscode.Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = vscode.window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [vscode.QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === vscode.QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}