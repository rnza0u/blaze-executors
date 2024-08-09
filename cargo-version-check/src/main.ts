import { Executor } from '@blaze-repo/node-devkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import toml from 'toml'

const optionsSchema = z.object({
    version: z.string().min(1),
    workspaceDependencies: z.array(z.string().min(1)).default([]),
    workspaceBuildDependencies: z.array(z.string().min(1)).default([]),
    workspaceDevDependencies: z.array(z.string().min(1)).default([])
})

const cargoDependenciesSchema = z.record(z.union([
    z.string().min(1).transform(version => ({ version })),
    z.object({
        version: z.string().min(1)
    })
]))

const cargoSchema = z.object({
    package: z.object({
        version: z.string().min(1)
    }),
    dependencies: cargoDependenciesSchema.default({}),
    'build-dependencies': cargoDependenciesSchema.default({}),
    'dev-dependencies': cargoDependenciesSchema.default({}),
}).transform(schema => ({
    package: schema.package,
    dependencies: schema.dependencies,
    buildDependencies: schema['build-dependencies'],
    devDependencies: schema['dev-dependencies']
}))

const executor: Executor = async (context, userOptions) => {

    const options = await optionsSchema.parseAsync(userOptions)
    const path = join(context.project.root, 'Cargo.toml')
    const cargo = await cargoSchema.parseAsync(toml.parse(await readFile(path, 'utf-8')))
    
    if (cargo.package.version !== options.version)
        throw Error(`invalid version (found=${cargo.package.version}, expected=${options.version})`)

    for (const { name, type } of [
        ...options.workspaceDependencies.map(name => ({ name, type: 'runtime' as const })),
        ...options.workspaceBuildDependencies.map(name => ({ name, type: 'build' as const })),
        ...options.workspaceDevDependencies.map(name => ({ name, type: 'dev' as const }))
    ]){
        const dependency = (() => {
            switch (type){
                case 'runtime':
                    return cargo.dependencies[name]
                case 'build':
                    return cargo.buildDependencies[name]
                case 'dev':
                    return cargo.devDependencies[name]
            }
        })()

        if (!dependency)
            throw Error(`${type} dependency "${name}" is not in cargo manifest`)

        if (dependency.version !== options.version)
            throw Error(`invalid dependency version for ${type} dependency "${name}" (found=${dependency.version}, expected=${options.version})`)
    }

    context.logger.info(`versions are consistent for ${context.project.name} ${cargo.package.version}`)
}

export default executor