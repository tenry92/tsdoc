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

    project.nodePackage = {
      author: '',
      description: '',
      name: path.basename(projectPath),
      version: '1.0.0',
    };

    logger.verbose(`reading ${project.packageFile}`);
    try {
      const nodePkgJson = await fs.readFile(project.packageFile, 'utf8');
      project.nodePackage = {...project.nodePackage, ...JSON.parse(nodePkgJson)};
    } catch {}

    logger.verbose(`reading ${docConfigFile}`);
    const tsdocConfigJson = await fs.readFile(docConfigFile, 'utf8');
    const tsdocConfig = {
      excludePrivate: false,
      excludeProtected: false,
      moduleName: project.nodePackage!.name,
      theme: 'default',
      title: project.nodePackage!.name,
      tsConfigFile: 'tsconfig.json',
      ...JSON.parse(tsdocConfigJson),
    } as ProjectConfig;

    absolutePaths(tsdocConfig, project.basePath, [
      'source',
      'destination',
      'tsConfigFile',
    ]);

    if(/^(.|..)?\//.test(tsdocConfig.theme)) {
      if(!path.isAbsolute(tsdocConfig.theme)) {
        absolutePaths(tsdocConfig, project.basePath, ['theme']);
      }
    } else {
      absolutePaths(tsdocConfig, path.join(__dirname, '../themes'), ['theme']);
    }

    project.config = tsdocConfig;

    logger.verbose(`reading ${project.config.tsConfigFile}`);
    const tsConfigJson = await fs.readFile(project.config.tsConfigFile, 'utf8');
    const tsConfig = ts.parseConfigFileTextToJson(project.config.tsConfigFile, tsConfigJson);
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

    project.compilerOptions = compilerOptions;

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
}
