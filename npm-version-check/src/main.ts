import { Executor } from '@blaze-repo/node-devkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'

const optionsSchema = z.object({
    version: z.string().min(1),
    workspaceDependencies: z.array(z.string().min(1)).default([])
})

const packageJsonSchema = z.object({
    version: z.string().min(1),
    dependencies: z.record(z.string().min(1)).default({})
})

const executor: Executor = async (context, userOptions) => {

    const options = await optionsSchema.parseAsync(userOptions)
    const path = join(context.project.root, 'package.json')
    const packageJson = await packageJsonSchema.parseAsync(JSON.parse(await readFile(path, 'utf-8')))
    
    if (packageJson.version !== options.version)
        throw Error(`invalid version (found=${packageJson.version}, expected=${options.version})`)

    for (const dependency in packageJson.dependencies){
        if (!options.workspaceDependencies.includes(dependency))
            continue
        
        const version = packageJson.dependencies[dependency]

        if (version !== options.version)
            throw Error(`invalid dependency version for "${dependency}" (found=${version}, expected=${options.version})`)
    }

    context.logger.info(`versions are consistent for ${context.project.name} ${packageJson.version}`)
}

export default executor