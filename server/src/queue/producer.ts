import { Queue } from 'bullmq'

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379

export const taskQueue = new Queue('tasks', {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
})

export async function enqueueTask(
  taskId: string,
  taskType: string,
  componentIds: string[],
  config: Record<string, any>,
  inputArtifactId?: string,
) {
  await taskQueue.add('run-task', {
    taskId,
    taskType,
    componentIds,
    config,
    inputArtifactId,
  }, {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  })
}
