import { Executor } from '@blaze-repo/node-devkit'
import { z } from 'zod'
import toml from 'toml'
import semver from 'semver'
import { join, parse } from 'node:path'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { shell } from 'executors-common'

const optionsSchema = z.object({
    binPath: z.string().min(1),
    outputPath: z.string().min(1),
    platform: z.string().min(1),
    overwrite: z.boolean().default(false)
})

const executor: Executor = async (context, _options) => {

    const options = await optionsSchema.parseAsync(_options)

    const currentVersion = await version(context.project.root)

    const versionDirectoryPath = join(options.outputPath, currentVersion.toString())

    const versionExists = await isdir(versionDirectoryPath)

    if (!versionExists){
        await mkdir(versionDirectoryPath)
        context.logger.info(`created version directory ${versionDirectoryPath}`)
    }
    else {
        context.logger.info(`${versionDirectoryPath} already exists`)
    }

    const buildDirectory = join(versionDirectoryPath, options.platform)

    if (await isdir(buildDirectory)){

        if (!options.overwrite){
            context.logger.warn(`build already exists for ${currentVersion}:${options.platform}. not overwriting.`)
            return
        }

        context.logger.warn(`existing build for ${currentVersion}:${options.platform} will be overwritten.`)
        await rm(buildDirectory, {
            recursive: true,
            force: true
        })
    }

    try {

        await mkdir(buildDirectory)

        context.logger.info(`build directory created at ${buildDirectory}`)

        const metadata = {
            checksum: await sha256(options.binPath),
            size: (await stat(options.binPath)).size
        }

        const metadataFilePath = join(buildDirectory, 'metadata.json')
        await writeFile(metadataFilePath, JSON.stringify(metadata), 'utf-8')

        context.logger.info(`metadata file written to ${metadataFilePath}`)

        const packagePath = join(buildDirectory, 'blaze.tar.gz')

        await tar(
            [options.binPath],
            packagePath
        )

        context.logger.info(`release package written to ${packagePath}`)

    } catch (err){
        
        context.logger.error(`release failed ! removing ${buildDirectory}`)
        await rm(buildDirectory, { 
            recursive: true, 
            force: true 
        })
        
        throw err
    }
}

async function isdir(path: string){
    try {
        const filestat = await stat(path)
        return filestat.isDirectory()
    } catch (err){
        if ((err as NodeJS.ErrnoException).code === 'ENOENT')
            return false
        throw err
    }
}

async function tar(inputs: string[], out: string): Promise<void> {
    await shell(
        'tar', 
        [
            '--create',
            '--file',
            out,
            '--gzip',
            ...inputs.map(path => parse(path)).flatMap(path => ['-C', path.dir, path.base])
        ]
    )
}

async function sha256(path: string): Promise<string> {
    const hasher = createHash('sha256')
    const data = createReadStream(path)
    await pipeline(data, hasher)
    return hasher.digest('hex')
}

async function version(root: string): Promise<semver.SemVer> {
    const path = join(root, 'Cargo.toml')
    const content = await readFile(path, 'utf-8')
    const { package: { version: versionString } } = toml.parse(content)
    const version = semver.parse(versionString)
    if (!version)
        throw Error(`invalid current version (${versionString})`)
    return version
}

export default executor