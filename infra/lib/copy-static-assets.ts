import * as path from 'path';
import type { ICommandHooks } from 'aws-cdk-lib/aws-lambda-nodejs';

/** Converts backslashes to forward slashes so the paths are valid inside a node -e string on every OS. */
function forward(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * CDK bundling command hooks that copy the app's non-JS assets into the
 * bundle output directory after esbuild has run, so they exist next to the
 * bundled lambda.js at runtime:
 *   - src/landing.html -> <outdir>/landing.html
 *   - public/icon.png  -> <outdir>/public/icon.png
 *
 * The copied files are part of the bundling output dir, therefore they are
 * included in the Lambda ZIP and in the asset hash (deploys when they change).
 */
export function copyStaticAssetsHooks(): ICommandHooks {
  return {
    beforeBundling(): string[] {
      return [];
    },
    beforeInstall(): string[] {
      return [];
    },
    afterBundling(inputDir: string, outputDir: string): string[] {
      const script = [
        `require('fs').mkdirSync('${forward(path.join(outputDir, 'public'))}', { recursive: true })`,
        `require('fs').copyFileSync('${forward(path.join(inputDir, 'src', 'landing.html'))}', '${forward(path.join(outputDir, 'landing.html'))}')`,
        `require('fs').copyFileSync('${forward(path.join(inputDir, 'public', 'icon.png'))}', '${forward(path.join(outputDir, 'public', 'icon.png'))}')`,
      ].join(';');
      return [`node -e "${script}"`];
    },
  };
}
