import { Executor } from '@blaze-repo/node-devkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import { shell } from 'executors-common'

const optionsSchema = z.object({
    registry: z.string().min(1)
})

const envSchema = z.object({
    HOME: z.string().min(1)
})

const executor: Executor = async (context, userOptions) => {

    const { registry } = await optionsSchema.parseAsync(userOptions)
    const env = await envSchema.parseAsync(process.env)
    
    try {
        const json = await readFile(join(env['HOME'], '.docker/config.json'))
        const { auths = {} } = JSON.parse(json)
        if (!(registry in auths)){
            context.logger.warn(`already logged out from ${registry}`)
            return
        }

    } catch (err){
        if (err.code !== 'ENOENT')
            throw err
    }

    await shell(
        'docker', 
        [
            'logout',
            registry
        ]
    )
}


export default executor