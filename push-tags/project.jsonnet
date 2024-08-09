local npm = import 'npm.libsonnet';

{
    targets: npm.all('push-tags', {
        workspaceDependencies: ['node-executors-common']
    })
}