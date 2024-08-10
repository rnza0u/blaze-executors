import { Executor } from '@blaze-repo/node-devkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import { shell } from 'executors-common'

const optionsSchema = z.object({
    registry: z.string().min(1),
    force: z.boolean().default(false)
})

const envSchema = z.object({
    HOME: z.string().min(1),
    DOCKER_REGISTRY_USERNAME: z.string().min(1),
    DOCKER_REGISTRY_PASSWORD: z.string().min(1)
})

const executor: Executor = async (context, userOptions) => {

    const { registry, force } = await optionsSchema.parseAsync(userOptions)
    const env = await envSchema.parseAsync(process.env)
    
    try {
        const json = await readFile(join(env['HOME'], '.docker/config.json'), 'utf-8')
        const { auths = {} } = JSON.parse(json)
        if (registry in auths && !force){
            context.logger.warn(`already logged in to ${registry}`)
            return
        }

    } catch (err){
        if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT')
            throw err
    }

    const username = env['DOCKER_REGISTRY_USERNAME']
    const password = env['DOCKER_REGISTRY_PASSWORD']

    if (!username || !password)
        throw Error('credentials required')

    await shell(
        'docker', 
        [
            'login',
            '--username',
            env['DOCKER_REGISTRY_USERNAME'],
            '--password-stdin',
            registry
        ],
        {
            input: password
        }
    )
}


export default executor