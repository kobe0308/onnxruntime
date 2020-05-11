// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs-extra';
import * as path from 'path';

import {InferenceSession, Tensor} from '../lib';

import {assertTensorEqual, loadTensorFromFile, shouldSkipModel} from './test-utils';

export function run(testDataFolder: string): void {
  const models = fs.readdirSync(testDataFolder);

  for (const model of models) {
    // read each model folders
    const modelFolder = path.join(testDataFolder, model);
    let modelPath: string;
    const modelTestCases: Array<[Array<Tensor|undefined>, Array<Tensor|undefined>]> = [];
    for (const currentFile of fs.readdirSync(modelFolder)) {
      const currentPath = path.join(modelFolder, currentFile);
      const stat = fs.lstatSync(currentPath);
      if (stat.isFile()) {
        const ext = path.extname(currentPath);
        if (ext.toLowerCase() === '.onnx') {
          modelPath = currentPath;
        }
      } else if (stat.isDirectory()) {
        const inputs: Array<Tensor|undefined> = [];
        const outputs: Array<Tensor|undefined> = [];
        for (const dataFile of fs.readdirSync(currentPath)) {
          const dataFileFullPath = path.join(currentPath, dataFile);
          const ext = path.extname(dataFile);

          if (ext.toLowerCase() === '.pb') {
            let tensor: Tensor|undefined;
            try {
              tensor = loadTensorFromFile(dataFileFullPath);
            } catch (e) {
              console.warn(`[${model}] Failed to load test data: ${e.message}`);
            }

            if (dataFile.indexOf('input') !== -1) {
              inputs.push(tensor);
            } else if (dataFile.indexOf('output') !== -1) {
              outputs.push(tensor);
            }
          }
        }
        modelTestCases.push([inputs, outputs]);
      }
    }

    // add cases
    describe(`${model}`, () => {
      let session: InferenceSession;
      const skipModel = shouldSkipModel(model, ['cpu']);
      if (!skipModel) {
        before(async () => {
          session = await InferenceSession.create(modelPath);
        });
      } else {
        console.log(`[test-runner] skipped: ${model}`);
      }

      for (let i = 0; i < modelTestCases.length; i++) {
        const testCase = modelTestCases[i];
        const inputs = testCase[0];
        const expectedOutputs = testCase[1];
        if (!skipModel && !inputs.some(t => t === undefined) && !expectedOutputs.some(t => t === undefined)) {
          it(`case${i}`, async () => {
            const feeds = {};
            if (inputs.length !== session.inputNames.length) {
              throw new RangeError('input length does not match name list');
            }
            for (let i = 0; i < inputs.length; i++) {
              feeds[session.inputNames[i]] = inputs[i];
            }
            const outputs = await session.run(feeds);

            let j = 0;
            for (const name of session.outputNames) {
              assertTensorEqual(outputs[name], expectedOutputs[j++]!);
            }
          });
        }
      }
    });
  }
}
