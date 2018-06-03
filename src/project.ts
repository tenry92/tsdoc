import {promises as fs} from 'fs';
import * as path from 'path';

import * as ts from 'typescript';
import * as winston from 'winston';

import {DocEntry, FileDocEntry} from './doc';
import emit from './emit';
import Parser from './parser';

function absolutePaths(input: {[key: string]: any}, basePath: string, keys: string[]) {
  for(const key of keys) {
    if(!path.isAbsolute(input[key])) {
      input[key] = path.join(basePath, input[key]);
    }
  }
}

async function findFile(names: string[]) {
  for(const name of names) {
    try {
      await fs.access(name);
    } catch {}
  }

  return undefined;
}

export interface NodePackage {
  name: string;
  version: string;
  description: string;
  author: string;
}

export interface ProjectConfig {
  excludePrivate: boolean;
  excludeProtected: boolean;
  moduleName: string;
  source: string;
  destination: string;
  theme: string;
  title: string;
  tsConfigFile: string;
}

export default class Project {
  static async fromConfigFile(projectPath: string, logger: winston.LoggerInstance) {
    const stats = await fs.stat(projectPath);
    let docConfigFile: string;

    if(stats.isFile()) {
      docConfigFile = projectPath;
      projectPath = path.dirname(docConfigFile);
    } else if(stats.isDirectory()) {
      docConfigFile = path.join(projectPath, 'tsdoc.json');
    } else {
      throw new Error(`${projectPath} not found`);
    }

    const project = new Project(projectPath, logger);
    project.packageFile = path.join(project.basePath, 'package.json');

    await project.readPackageFile();
    await project.readTsdocFile();
    await project.readTsConfigFile();

    return project;
  }

  nodePackage?: NodePackage;

  compilerOptions?: ts.CompilerOptions;

  config?: ProjectConfig;

  packageFile?: string;

  docs = [] as DocEntry[];

  files = [] as DocEntry[];

  private constructor(readonly basePath: string, readonly logger: winston.LoggerInstance) {}

  async generateDocumentation() {
    const parser = new Parser(this);
    const {docs, files} = await parser.parse();

    this.docs = docs;
    this.files = files;

    await emit(this);
  }

  private async readPackageFile() {
    this.nodePackage = {
      author: '',
      description: '',
      name: path.basename(this.basePath),
      version: '1.0.0',
    };

    this.logger.verbose(`reading ${this.packageFile}`);
    try {
      const nodePkgJson = await fs.readFile(this.packageFile!, 'utf8');
      this.nodePackage = {...this.nodePackage, ...JSON.parse(nodePkgJson)};
    } catch {}
  }

  private async readTsdocFile() {
    const docConfigFile = path.join(this.basePath, 'tsdoc.json');
    this.logger.verbose(`reading ${docConfigFile}`);
    const tsdocConfigJson = await fs.readFile(docConfigFile, 'utf8');
    const tsdocConfig = {
      excludePrivate: false,
      excludeProtected: false,
      moduleName: this.nodePackage!.name,
      theme: 'default',
      title: this.nodePackage!.name,
      tsConfigFile: 'tsconfig.json',
      ...JSON.parse(tsdocConfigJson),
    } as ProjectConfig;

    absolutePaths(tsdocConfig, this.basePath, [
      'source',
      'destination',
      'tsConfigFile',
    ]);

    if(/^(.|..)?\//.test(tsdocConfig.theme)) {
      if(!path.isAbsolute(tsdocConfig.theme)) {
        absolutePaths(tsdocConfig, this.basePath, ['theme']);
      }
    } else {
      absolutePaths(tsdocConfig, path.join(__dirname, '../themes'), ['theme']);
    }

    const themeDir = tsdocConfig.theme;
    const themePkgFile = path.join(themeDir, 'package.json');

    try {
      this.logger.verbose(`trying to read ${themePkgFile}`);
      const themePkg = JSON.parse(await fs.readFile(themePkgFile, 'utf8'));

      if(typeof themePkg.main == 'string') {
        const mainFile = path.resolve(themeDir, themePkg.main);
        tsdocConfig.theme = path.dirname(mainFile);
      }
    } catch {
      this.logger.verbose(`reading ${themePkgFile} failed`);
    }

    this.config = tsdocConfig;
  }

  private async readTsConfigFile() {
    this.logger.verbose(`reading ${this.config!.tsConfigFile}`);
    const tsConfigJson = await fs.readFile(this.config!.tsConfigFile, 'utf8');
    const tsConfig = ts.parseConfigFileTextToJson(this.config!.tsConfigFile, tsConfigJson);
    const compilerOptions = tsConfig.config.compilerOptions;

    switch((compilerOptions.module || 'CommonJS').toLowerCase()) {
      case 'commonjs': compilerOptions.module = ts.ModuleKind.CommonJS; break;
      case 'amd': compilerOptions.module = ts.ModuleKind.AMD; break;
      case 'umd': compilerOptions.module = ts.ModuleKind.UMD; break;
      case 'system': compilerOptions.module = ts.ModuleKind.System; break;
      case 'es2015': compilerOptions.module = ts.ModuleKind.ES2015; break;
      case 'esnext': compilerOptions.module = ts.ModuleKind.ESNext; break;
    }

    switch((compilerOptions.moduleResolution || 'node').toLowerCase()) {
      case 'classic': compilerOptions.moduleResolution = ts.ModuleResolutionKind.Classic; break;
      case 'node': compilerOptions.moduleResolution = ts.ModuleResolutionKind.NodeJs; break;
    }

    this.compilerOptions = compilerOptions;
  }
}
