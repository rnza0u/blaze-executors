import { Executor } from '@blaze-repo/node-devkit'
import { shell } from 'executors-common'
import { z } from 'zod'

const optionsSchema = z.object({
    dryRun: z.boolean().default(false),
    tags: z.array(z.string().min(1)).transform(a => new Set(a))
})

const executor: Executor = async (context, options) => {

    const { tags, dryRun } = await optionsSchema.parseAsync(options)

    if (tags.size === 0) {
        context.logger.warn('no tags were provided')
        return
    }

    const { stdout } = await shell(
        'git',
        ['status', '--porcelain'],
        { cwd: context.workspace.root }
    )

    if (stdout.length > 0)
        throw Error('worktree is not clean, aborting creating tags')

    if (dryRun) {
        context.logger.warn(`aborting because dry run. would have created tags: ${JSON.stringify([...tags])}`)
        return
    }

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

    await shell(
        'git',
        [
            'remote',
            'set-url',
            'origin',
            'git@github.com:rnza0u/main.git'
        ]
    )

    await shell(
        'git',
        [
            'remote',
            'set-url',
            '--push',
            'origin',
            'git@github.com:rnza0u/main.git'
        ]
    )

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

export default executor