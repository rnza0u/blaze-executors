import { Executor } from '@blaze-repo/node-devkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import toml from 'toml'
import semver, { SemVer } from 'semver'
import { shell, wait } from 'executors-common'

const optionsSchema = z.object({
    dryRun: z.boolean(),
    channel: z.string().default('stable'),
    unstableFeatures: z.array(z.string().min(1)).default([]),
    noCheck: z.boolean().default(false)
})

const envSchema = z.object({
    CARGO_TOKEN: z.string().min(1)
})

const versionSchema = z.string().transform(v => {
    const version = semver.parse(v) 
    if (version === null)
        throw new Error(`could not parse version "${v}"`)
    return version
})

const cargoSchema = z.object({
    package: z.object({
        name: z.string().min(1),
        version: versionSchema
    })
})

const crateMetadataSchema = z.object({
    versions: z.array(z.object({
        num: versionSchema
    }))
})

const cratesIoHeaders = {
    'User-Agent': 'https://github.com/rnza0un.git'
}

const executor: Executor = async (context, userOptions) => {

    const options = await optionsSchema.parseAsync(userOptions)
    const env = await envSchema.parseAsync(process.env)
    const path = join(context.project.root, 'Cargo.toml')
    const cargo = await cargoSchema.parseAsync(toml.parse(await readFile(path, 'utf-8')))
    
    if (await versionExists(cargo.package.name, cargo.package.version)){
        context.logger.warn(`${context.project.name} is already published in version ${cargo.package.version}`)
        return
    }

    await shell(
        'cargo', 
        [
            ...(options.channel !== 'stable' ? [`+${options.channel}`] : []),
            'publish',
            ...(options.unstableFeatures.flatMap(feature => ['-Z', feature])),
            '--token',
            env['CARGO_TOKEN'],
            ...(options.dryRun ? ['--dry-run'] : []),
            ...(options.noCheck ? ['--no-verify'] : [])
        ],
        { cwd: context.project.root }
    )

    if (options.dryRun)
        return

    context.logger.info(`${cargo.package.name} was published, waiting for package to be available...`)

    while (!(await versionExists(cargo.package.name, cargo.package.version))) {
        await wait(60_000)
    }

    context.logger.info(`${cargo.package.name} is available in version ${cargo.package.version}`)
}

async function versionExists(name: string, version: SemVer): Promise<boolean> {

    const registryUrl = new URL('https://crates.io/')
    const crateUrl = new URL(registryUrl)
    crateUrl.pathname = `/api/v1/crates/${name}`

    const response = await fetch(crateUrl, {
        headers: cratesIoHeaders
    })

    switch (response.status){
        case 200: {
            const { versions } = await crateMetadataSchema.parseAsync(await response.json())
            return versions.some(v => v.num.compare(version) === 0)
        }
        case 404:
            return false
        default:
            throw Error(`bad response status for ${crateUrl} (${response.status})`)
    }
}

export default executor