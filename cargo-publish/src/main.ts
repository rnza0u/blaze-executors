import { Executor } from '@blaze-repo/node-devkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import toml from 'toml'
import semver, { SemVer } from 'semver'
import { shell, wait } from 'executors-common'

const versionSchema = z.string().transform(v => {
    const version = semver.parse(v)
    if (version === null)
        throw new Error(`could not parse version "${v}"`)
    return version
})

const stringSet = z.array(z.string().min(1)).default([]).transform(a => new Set(a))

const optionsSchema = z.object({
    releaseVersion: versionSchema,
    linkedDependencies: z.object({
        runtime: stringSet,
        build: stringSet,
        dev: stringSet
    }).default({})
})

const envSchema = z.object({
    CARGO_TOKEN: z.string().min(1)
})

const dependencySchema = z.union([
    z.string().min(1),
    z.object({
        version: z.string().min(1).optional(),
        path: z.string().min(1).optional()
    })
]).transform(dep => {
    if (typeof dep === 'string')
        return {
            version: dep
        }
    return dep
})

const cargoSchema = z.object({
    package: z.object({
        name: z.string().min(1),
        version: versionSchema
    }),
    dependencies: z.record(dependencySchema).default({}),
    'build-dependencies': z.record(dependencySchema).default({}),
    'dev-dependencies': z.record(dependencySchema).default({})
})

const crateMetadataSchema = z.object({
    versions: z.array(z.object({
        num: versionSchema
    }))
})

const cratesIoHeaders = {
    'User-Agent': 'https://github.com/rnza0u'
}

const executor: Executor = async (context, userOptions) => {

    const options = await optionsSchema.parseAsync(userOptions)
    const env = await envSchema.parseAsync(process.env)
    const manifestPath = join(context.project.root, 'Cargo.toml')
    const manifest = await cargoSchema.parseAsync(toml.parse(await readFile(manifestPath, 'utf-8')))

    const { stdout } = await shell(
        'git',
        ['status', '--porcelain'],
        { cwd: context.workspace.root }
    )

    if (stdout.length > 0)
        throw Error('worktree is not clean, aborting publish')


    if (await versionExists(manifest.package.name, manifest.package.version)) {
        context.logger.warn(`${context.project.name} is already published in version ${manifest.package.version}`)
        return
    }

    // bump linked dependencies versions
    for (const { key, dependencies, addFlag } of [
        {
            key: 'dependencies' as const,
            dependencies: options.linkedDependencies.runtime
        },
        {
            key: 'build-dependencies' as const,
            addFlag: '--build',
            dependencies: options.linkedDependencies.build
        },
        {
            key: 'dev-dependencies' as const,
            addFlag: '--dev',
            dependencies: options.linkedDependencies.dev
        }
    ]) {

        if (dependencies.size === 0)
            continue

        const manifestDependencies = manifest[key]

        if (!manifestDependencies)
            throw Error(`no "${key}" declared at ${manifestPath} and ${dependencies.size} project(s) should be version linked in that section`)

        for (const dependency of dependencies) {
            const manifestDependency = manifestDependencies[dependency]

            if (!manifestDependency)
                throw Error(`"${key}.${dependency}" could not be found and should be version linked`)

            // see https://github.com/rust-lang/cargo/issues/14510 for why we use this workaround
            const path = manifestDependency['path']

            await shell(
                'cargo',
                [
                    'add',
                    ...(typeof addFlag === 'string' ? [addFlag] : []),
                    `${dependency}@${options.releaseVersion}`
                ],
                {
                    cwd: context.project.root
                }
            )

            if (path) {
                await shell(
                    'cargo',
                    [
                        'add',
                        '--path',
                        path
                    ],
                    {
                        cwd: context.project.root
                    }
                )
            }
        }
    }

    await shell(
        'cargo',
        [
            'bump',
            options.releaseVersion.toString()
        ],
        {
            cwd: context.project.root
        }
    )

    await shell(
        'git',
        [
            'add',
            join(context.workspace.projects[context.project.name].path, 'Cargo.toml'),
            join(context.workspace.projects[context.project.name].path, 'Cargo.lock')
        ],
        {
            cwd: context.workspace.root
        }
    )

    await shell(
        'git',
        [
            'commit',
            '-m',
            `release: bump package version to ${options.releaseVersion} and linked dependencies versions for ${manifest.package.name} (${context.project.name})`
        ]
    )

    await shell(
        'cargo',
        [
            'publish',
            '--token',
            env['CARGO_TOKEN']
        ],
        { cwd: context.project.root }
    )

    context.logger.info(`${manifest.package.name} was published, waiting for package to be available...`)

    while (!(await versionExists(manifest.package.name, manifest.package.version)))
        await wait(60_000)

    context.logger.info(`${manifest.package.name} is available in version ${manifest.package.version}`)
}

async function versionExists(name: string, version: SemVer): Promise<boolean> {

    const registryUrl = new URL('https://crates.io/')
    const crateUrl = new URL(registryUrl)
    crateUrl.pathname = `/api/v1/crates/${name}`

    const response = await fetch(crateUrl, {
        headers: cratesIoHeaders
    })

    switch (response.status) {
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