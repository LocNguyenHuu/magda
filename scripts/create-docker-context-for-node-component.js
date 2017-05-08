#!/usr/bin/env node
const childProcess = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const process = require('process');
const yargs = require('yargs');

const argv = yargs.options({
    include: {
        description: 'The files and directories to include in the Docker image.  Dockerfile, node_modules, and bin are included by default and do not need to be listed.',
        default: [],
        type: 'array'
    },
    build: {
        description: 'Pipe the Docker context straight to Docker.',
        type: 'boolean'
    },
    tag: {
        description: 'The tag to pass to "docker build".  This parameter is only used if --build is specified.',
        type: 'string'
    },
    output: {
        description: 'The output path and filename for the Docker context .tar file.',
        type: 'string'
    }
}).help().argv;

if (!argv.build && !argv.output) {
    console.log('Either --build or --output <filename> must be specified.');
    process.exit(1);
}

const componentSrcDir = path.resolve(process.cwd())
const dockerContextDir = path.resolve(__dirname, '..', 'docker-context');
const componentDestDir = path.resolve(dockerContextDir, process.env.npm_package_name);

fse.emptyDirSync(dockerContextDir);
fse.ensureDirSync(componentDestDir);
fse.ensureSymlinkSync(path.resolve(componentSrcDir, '..', 'node_modules'), path.resolve(dockerContextDir, 'node_modules'), 'junction');

const linksToCreate = argv.include.concat(['node_modules', 'bin', 'Dockerfile']).filter((value, index, self) => self.indexOf(value) === index);
linksToCreate.forEach(link => {
    const src = path.resolve(componentSrcDir, link);
    const dest = path.resolve(componentDestDir, link);
    const type = fse.statSync(src).isFile() ? 'file' : 'junction'

    // On Windows we can't create symlinks to files without special permissions.
    // So just copy the file instead.  Usually creating directory junctions is
    // fine without special permissions, but fall back on copying in the unlikely
    // event that fails, too.
    try {
        fse.ensureSymlinkSync(src, dest, type);
    } catch(e) {
        fse.copySync(src, dest);
    }
});

const tar = process.platform === 'darwin' ? 'gtar' : 'tar';

if (argv.build) {
    // Docker and ConEmu (an otherwise excellent console for Windows) don't get along.
    // See: https://github.com/Maximus5/ConEmu/issues/958 and https://github.com/moby/moby/issues/28814
    // So if we're running under ConEmu, we need to add an extra -cur_console:i parameter to disable
    // ConEmu's hooks and also set ConEmuANSI to OFF so Docker doesn't do anything drastic.
    const env = Object.assign({}, process.env);
    const extraParameters = [];
    if (env.ConEmuANSI === 'ON') {
        env.ConEmuANSI = 'OFF';
        extraParameters.push('-cur_console:i');
    }

    const tarProcess = childProcess.spawn(tar, [...extraParameters, '--dereference', '-cf', '-', '*'], {
        cwd: dockerContextDir,
        stdio: ['inherit', 'pipe', 'inherit'],
        env: env
    });

    const tagArgs = argv.tag ? ['-t', argv.tag] : [];
    const dockerProcess = childProcess.spawn(
        'docker',
        [...extraParameters, 'build', ...tagArgs, '-f', `./${process.env.npm_package_name}/Dockerfile`, '-'], {
        stdio: ['pipe', 'inherit', 'inherit'],
        env: env
    });

    dockerProcess.on('close', code => {
        fse.removeSync(dockerContextDir);
        process.exit(code);
    });

    tarProcess.on('close', code => {
        dockerProcess.stdin.end();
    });

    tarProcess.stdout.on('data', data => {
        dockerProcess.stdin.write(data);
    });
} else if (argv.output) {
    console.log(path.resolve(process.cwd(), argv.output));
    const tarProcess = childProcess.spawnSync(tar, ['--dereference', '-cf', argv.output, '*'], {
        stdio: 'inherit'
    });
    console.log(tarProcess.status);
    fse.removeSync(dockerContextDir);
}
