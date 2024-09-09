import { Executor } from '@blaze-repo/node-devkit'
import { shell } from 'executors-common'
import { z } from 'zod'

const optionsSchema = z.object({
    pushRemote: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).transform(a => new Set(a)),
    branch: z.string().min(1).default('master')
})

const executor: Executor = async (context, options) => {

    const { tags, pushRemote, branch } = await optionsSchema.parseAsync(options)

    if (tags.size === 0) {
        context.logger.warn('no tags were provided')
    }

    const { stdout } = await shell(
        'git',
        ['status', '--porcelain'],
        { cwd: context.workspace.root }
    )

    if (stdout.length > 0)
        throw Error('worktree is not clean, aborting creating tags')

    for (const tag of tags) {
        context.logger.info(`creating tag ${tag}`)
        await shell(
            'git',
            [
                'tag',
                '-a',
                tag,
                '-m',
                `auto-generated tag for ${context.project.name}`
            ],
            { cwd: context.workspace.root }
        )
    }

    context.logger.info('setting remote before pushing tags')

    if (pushRemote){
        await shell(
            'git',
            [
                'remote',
                'set-url',
                '--push',
                'origin',
                pushRemote
            ]
        )
    }

    context.logger.info(`pushing changes to remote`)
    await shell(
        'git',
        ['push', '--set-upstream', 'origin', branch],
        {
            cwd: context.workspace.root
        }
    )

    if (tags.size > 0){
        context.logger.info(`pushing ${tags.size} tags`)
        await shell(
            'git',
            [
                'push',
                'origin',
                '--tags'
            ],
            { cwd: context.workspace.root }
        )
    }
}

export default executor