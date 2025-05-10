import { Executor } from '@blaze-repo/node-devkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import semver, { SemVer } from 'semver'
import { shell, wait } from 'executors-common'

function parseVersion(version: string): semver.SemVer {
    const parsed = semver.parse(version)
    if (parsed === null)
        throw Error(`${version} is not a valid version`)
    return parsed
}

const versionSchema = z.string().transform(v => parseVersion(v))

const optionsSchema = z.object({
    releaseVersion: versionSchema
})

const packageJsonSchema = z.object({
    name: z.string().min(1),
    version: versionSchema
})

const packageMetadataSchema = z.object({
    versions: z.record(z.object({
        dist: z.object({
            tarball: z.string().transform(s => new URL(s))
        })
    })).transform(record => Object.fromEntries(
        Object.entries(record)
            .map(([version, value]) => [version, { parsedVersion: versionSchema.parse(version), ...value }]))
    )

})

const executor: Executor = async (context, userOptions) => {

    const options = await optionsSchema.parseAsync(userOptions)
    const packageJsonPath = join(context.project.root, 'package.json')
    const packageJson = await packageJsonSchema.parseAsync(JSON.parse(await readFile(packageJsonPath, 'utf-8')))

    const { stdout } = await shell(
        'git',
        ['status', '--porcelain'],
        { cwd: context.workspace.root }
    )

    if (stdout.length > 0)
        throw Error('worktree is not clean, aborting publish')

    let packageBump = false

    if (packageJson.version.compare(options.releaseVersion) !== 0){
        await shell(
            'pnpm',
            ['version', options.releaseVersion.toString()],
            {
                cwd: context.project.root
            }
        )
        packageBump = true
    } else {
        context.logger.warn(`package ${packageJson.name} is already at the release version ${options.releaseVersion}, not bumping...`)
    }

    if (packageBump){
        await shell(
            'git',
            [
                'add',
                join('pnpm-lock.yaml')
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
                `release: bump package version to ${options.releaseVersion} for ${packageJson.name}  [CI SKIP]`
            ]
        )
    }

    if (await versionExists(packageJson.name, options.releaseVersion)) {
        context.logger.warn(`version ${options.releaseVersion} is already published, aborting publish...`)
        return
    }

    await shell(
        'pnpm',
        [
            'publish',
            '--access',
            'public'
        ],
        { cwd: context.project.root }
    )

    context.logger.info(`${context.project.name} was published, waiting for it be available...`)

    while (!(await versionExists(packageJson.name, options.releaseVersion)))
        await wait(60_000)

    context.logger.info(`${context.project.name} is published and available in version ${options.releaseVersion}`)
}

async function versionExists(name: string, version: SemVer): Promise<boolean> {

    const registry = new URL('https://registry.npmjs.org')
    const packageUrl = new URL(registry)
    packageUrl.pathname = `/${name}`

    const packageResponse = await fetch(packageUrl)

    switch (packageResponse.status) {
        case 200: {
            const { versions } = await packageMetadataSchema.parseAsync(await packageResponse.json())

            const existing = Object.values(versions)
                .find(({ parsedVersion }) => parsedVersion.compare(version) === 0)

            if (!existing)
                return false

            const tarballResponse = await fetch(existing.dist.tarball)
            tarballResponse.body?.cancel()

            switch (tarballResponse.status) {
                case 200:
                    return true
                case 404:
                    return false
                default:
                    throw Error(`bad response status from registry for ${existing.dist.tarball} (status=${packageResponse.status})`)
            }
        }
        case 404:
            return false
        default:
            throw Error(`bad response status from registry for ${packageUrl} (${packageResponse.status})`)
    }
}

export default executor