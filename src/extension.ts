'use strict';
import * as vscode from 'vscode';
import { themeMultiStep } from './themeStep'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('vscode-mixer.start', () => {
    themeMultiStep(context)
  }));
}

export function deactivate() {
}