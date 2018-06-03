import {promises as fs} from 'fs';
import * as path from 'path';
import * as pug from 'pug';

import * as del from 'del';
import * as copy from 'recursive-copy';

import {DocEntry, FileDocEntry} from './doc';
import Project from './project';

interface EmitInput {
  docs: DocEntry[];
  files: FileDocEntry[];
}

class Renderer {
  get destination() {
    return this.project.config!.destination;
  }

  get assetsSrcPath() {
    return path.join(this.project.config!.theme, 'assets');
  }

  get assetsDestPath() {
    return path.join(this.project.config!.destination, 'assets');
  }

  get themeIndex() {
    return path.join(this.project.config!.theme, 'index.pug');
  }

  constructor(private project: Project) {}

  async clearOutput() {
    this.project.logger.info('clear output');
    this.project.logger.verbose(`removing ${this.destination}/*`);
    await del(`${this.destination}/*`);
  }

  async generate() {
    this.project.logger.info('creating destination folder');
    try {
      this.project.logger.verbose(`mkdir ${this.destination}`);
      await fs.mkdir(this.destination);
    } catch {}
    try {
      this.project.logger.verbose(`mkdir ${this.assetsDestPath}`);
      await fs.mkdir(this.assetsDestPath);
    } catch {}

    this.project.logger.info('copying theme assets');
    this.project.logger.verbose(`cp ${this.assetsSrcPath} => ${this.assetsDestPath}`);
    await copy(this.assetsSrcPath, this.assetsDestPath);

    await this.render(this.themeIndex, 'index.html', {
      config: this.project.config!,
      docs: this.project.docs,
      files: this.project.files,
    });
  }

  async render(pugFile: string, outFile: string, variables: object) {
    this.project.logger.verbose(`rendering ${outFile}`);
    const basePath = path.dirname(pugFile);
    const tpl = await fs.readFile(pugFile, 'utf8');
    const fn = pug.compile(tpl, {
      basedir: this.project.config!.theme,
      filename: pugFile,
    });
    const html = fn({
      ...variables,
      link: (subOutFile: string) => {
        return subOutFile;
      },
      ref: (symbol: string | DocEntry, source?: string | DocEntry) => {
        return '#';
      },
      render: (subPugFile: string, subOutFile: string, subVariables: object) => {
        if(!path.isAbsolute(subPugFile)) {
          subPugFile = path.join(basePath, subPugFile);
        }

        this.render(subPugFile, subOutFile, subVariables);
      },
    });

    await fs.writeFile(path.join(this.destination, outFile), html);
  }
}

export default async function emit(project: Project) {
  const renderer = new Renderer(project);

  await renderer.clearOutput();
  await renderer.generate();
}
