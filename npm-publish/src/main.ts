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
    dryRun: z.boolean().default(false)
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
    const path = join(context.project.root, 'package.json')
    const packageJson = await packageJsonSchema.parseAsync(JSON.parse(await readFile(path, 'utf-8')))

    const { stdout } = await shell(
        'git', 
        ['status', '--porcelain'], 
        { cwd: context.workspace.root }
    )
    
    if (stdout.length > 0)
        throw Error('worktree is not clean, aborting publish')

    if (await versionExists(packageJson.name, packageJson.version)) {
        context.logger.warn(`version ${packageJson.version} is already published.`)
        return
    }

    await shell(
        'npm',
        [
            'publish',
            '--access',
            'public',
            ...(options.dryRun ? ['--dry-run'] : [])
        ],
        { cwd: context.project.root }
    )

    if (options.dryRun) 
        return

    context.logger.info(`${context.project.name} was published, waiting for it be available...`)

    while (!(await versionExists(packageJson.name, packageJson.version)))
        await wait(60_000)

    context.logger.info(`${context.project.name} is published and available in version ${packageJson.version}`)
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

            switch (tarballResponse.status){
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