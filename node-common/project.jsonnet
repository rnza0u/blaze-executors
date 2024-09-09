local blaze = std.extVar('blaze');

{
    targets: {
        install: {
            executor: 'std:commands',
            options: {
                commands: [
                    {
                        program: 'npm',
                        arguments: ['install']
                    }
                ]
            },
            cache: {
                invalidateWhen: {
                    inputChanges: ['package.json', 'package-lock.json'],
                    filesMissing: ['node_modules']
                }
            }
        },
        source: {
            cache: {
                invalidateWhen: {
                    inputChanges: [
                        'src/**', 
                        'tsconfig.json'
                    ],
                    outputChanges: [
                        'lib/**'
                    ]
                }
            },
            dependencies: ['install']
        },
        lint: {
            executor: 'std:commands',
            options: {
                commands: [
                    {
                        program: './node_modules/.bin/eslint',
                        arguments: [
                            '--config',
                            './node_modules/rnz-eslint-config/eslint.config.js',
                        ] + (if blaze.vars.lint.fix then ['--fix'] else [])
                        + [blaze.project.root],
                        environment: {
                            ESLINT_USE_FLAT_CONFIG: 'true'
                        }
                    }
                ]
            },
            dependencies: [
                'source'
            ]
        },
        build: {
            executor: 'std:commands',
            options: {
                commands: [
                    {
                        program: 'npm',
                        arguments: ['run', 'build']
                    }
                ]
            },
            cache: {
                invalidateWhen: {
                    outputChanges: [
                        'dist/**'
                    ]
                }
            },
            dependencies: ['source']
        },
        clean: {
            executor: 'std:commands',
            options: {
                commands: [
                    {
                        program: 'rm',
                        arguments: ['-rf', 'lib', 'node_modules']
                    }
                ]
            }
        }
    }
}