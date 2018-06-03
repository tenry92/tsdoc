import {promises as fs} from 'fs';
import * as path from 'path';

import Project from './project';

import {ArgumentParser} from 'argparse';
import * as winston from 'winston';

async function main() {
  try {
    const logger = new winston.Logger({
      transports: [
        new (winston.transports.Console)(),
      ],
    });
    logger.level = 'verbose';
    logger.cli();

    const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '../package.json'), 'utf8'));

    const parser = new ArgumentParser({
      addHelp: true,
      description: pkg.description,
      version: pkg.version,
    });

    parser.addArgument('tsdoc.json');

    const args = parser.parseArgs();

    const project = await Project.fromConfigFile(args['tsdoc.json'], logger);
    await project.generateDocumentation();
  } catch(error) {
    console.error(error);
    process.exit(1);
  }
}

main();
