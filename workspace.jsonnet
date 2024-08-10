{
    # the workspace name
    name: 'blaze-executors',
    # add an entry to this dictionnary everytime you want to create a new project.
    projects: {
        [name]: name for name in [
            'cargo-publish',
            'cargo-version-check',
            'docker-authenticate',
            'docker-logout',
            'node-common',
            'npm-publish',
            'npm-version-check',
            'package-binaries',
            'push-tags'
        ]
    },
    # workspace global settings
    settings: {
        # a default project selector to use when none is specified
        # defaultSelector: <any selector>,
        # named project selectors for reuse
        selectors: {},
         # workspace log level if not overriden with the CLI 
        logLevel: 'Warn',
        # parallelism level to use when executing tasks (for e.g when using the `run` or `spawn` commands) if not overidden with the CLI.
        parallelism: 'None',
        # parallelism level to use when resolving executors
        resolutionParallelism: 'None'
    }
}
