import { describe, expect, vi, it, beforeEach, afterEach } from 'vitest'

import * as errors from '../../core/errors'
import {
  PrismaAdapter,
  DEFAULT_MODEL_NAME,
  DEFAULT_MAX_ATTEMPTS,
} from '../PrismaAdapter'

vi.useFakeTimers().setSystemTime(new Date('2024-01-01'))

let mockDb

beforeEach(() => {
  mockDb = {
    _activeProvider: 'sqlite',
    _runtimeDataModel: {
      models: {
        BackgroundJob: {
          dbName: null,
        },
      },
    },
    backgroundJob: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  }
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('constructor', () => {
  it('defaults this.model name', () => {
    const adapter = new PrismaAdapter({ db: mockDb })

    expect(adapter.model).toEqual(DEFAULT_MODEL_NAME)
  })

  it('can manually set this.model', () => {
    mockDb._runtimeDataModel.models = {
      Job: {
        dbName: null,
      },
    }
    mockDb.job = {}

    const adapter = new PrismaAdapter({
      db: mockDb,
      model: 'Job',
    })

    expect(adapter.model).toEqual('Job')
  })

  it('throws an error with a model name that does not exist', () => {
    expect(() => new PrismaAdapter({ db: mockDb, model: 'FooBar' })).toThrow(
      errors.ModelNameError,
    )
  })

  it('sets this.accessor to the correct Prisma accessor', () => {
    const adapter = new PrismaAdapter({ db: mockDb })

    expect(adapter.accessor).toEqual(mockDb.backgroundJob)
  })

  it('sets this.provider based on the active provider', () => {
    const adapter = new PrismaAdapter({ db: mockDb })

    expect(adapter.provider).toEqual('sqlite')
  })

  it('defaults this.maxAttempts', () => {
    const adapter = new PrismaAdapter({ db: mockDb })

    expect(adapter.maxAttempts).toEqual(DEFAULT_MAX_ATTEMPTS)
  })

  it('allows manually setting this.maxAttempts', () => {
    const adapter = new PrismaAdapter({ db: mockDb, maxAttempts: 10 })

    expect(adapter.maxAttempts).toEqual(10)
  })
})

describe('schedule()', () => {
  it('creates a job in the DB with required data', async () => {
    const createSpy = vi
      .spyOn(mockDb.backgroundJob, 'create')
      .mockReturnValue({ id: 1 })
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.schedule({
      handler: 'RedwoodJob',
      args: ['foo', 'bar'],
      queue: 'default',
      priority: 50,
      runAt: new Date(),
    })

    expect(createSpy).toHaveBeenCalledWith({
      data: {
        handler: JSON.stringify({
          handler: 'RedwoodJob',
          args: ['foo', 'bar'],
        }),
        priority: 50,
        queue: 'default',
        runAt: new Date(),
      },
    })
  })
})

describe('find()', () => {
  it('returns null if no job found', async () => {
    vi.spyOn(mockDb.backgroundJob, 'findFirst').mockReturnValue(null)
    const adapter = new PrismaAdapter({ db: mockDb })
    const job = await adapter.find({
      processName: 'test',
      maxRuntime: 1000,
      queue: 'foobar',
    })

    expect(job).toBeNull()
  })

  it('returns a job if found', async () => {
    const mockJob = { id: 1 }
    vi.spyOn(mockDb.backgroundJob, 'findFirst').mockReturnValue(mockJob)
    vi.spyOn(mockDb.backgroundJob, 'updateMany').mockReturnValue({ count: 1 })
    const adapter = new PrismaAdapter({ db: mockDb })
    const job = await adapter.find({
      processName: 'test',
      maxRuntime: 1000,
      queue: 'default',
    })

    expect(job).toEqual(mockJob)
  })

  it('increments the `attempts` count on the found job', async () => {
    const mockJob = { id: 1, attempts: 0 }
    vi.spyOn(mockDb.backgroundJob, 'findFirst').mockReturnValue(mockJob)
    const updateSpy = vi
      .spyOn(mockDb.backgroundJob, 'updateMany')
      .mockReturnValue({ count: 1 })
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.find({
      processName: 'test',
      maxRuntime: 1000,
      queue: 'default',
    })

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: 1 }),
      }),
    )
  })

  it('locks the job for the current process', async () => {
    const mockJob = { id: 1, attempts: 0 }
    vi.spyOn(mockDb.backgroundJob, 'findFirst').mockReturnValue(mockJob)
    const updateSpy = vi
      .spyOn(mockDb.backgroundJob, 'updateMany')
      .mockReturnValue({ count: 1 })
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.find({
      processName: 'test-process',
      maxRuntime: 1000,
      queue: 'default',
    })

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lockedBy: 'test-process' }),
      }),
    )
  })

  it('locks the job with a current timestamp', async () => {
    const mockJob = { id: 1, attempts: 0 }
    vi.spyOn(mockDb.backgroundJob, 'findFirst').mockReturnValue(mockJob)
    const updateSpy = vi
      .spyOn(mockDb.backgroundJob, 'updateMany')
      .mockReturnValue({ count: 1 })
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.find({
      processName: 'test-process',
      maxRuntime: 1000,
      queue: 'default',
    })

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lockedAt: new Date() }),
      }),
    )
  })
})

describe('success()', () => {
  it('deletes the job from the DB', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'delete')
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.success({ id: 1 })

    expect(spy).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

describe('failure()', () => {
  it('updates the job by id', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'update')
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.failure({ id: 1 }, new Error('test error'))

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    )
  })

  it('clears the lock fields', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'update')
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.failure({ id: 1 }, new Error('test error'))

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lockedAt: null, lockedBy: null }),
      }),
    )
  })

  it('reschedules the job at a designated backoff time', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'update')
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.failure({ id: 1, attempts: 10 }, new Error('test error'))

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runAt: new Date(new Date().getTime() + 1000 * 10 ** 4),
        }),
      }),
    )
  })

  it('records the error', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'update')
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.failure({ id: 1, attempts: 10 }, new Error('test error'))

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining('test error'),
        }),
      }),
    )
  })

  it('marks the job as failed if max attempts reached', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'update')
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.failure({ id: 1, attempts: 24 }, new Error('test error'))

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedAt: new Date(),
        }),
      }),
    )
  })

  it('nullifies runtAt if max attempts reached', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'update')
    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.failure({ id: 1, attempts: 24 }, new Error('test error'))

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runAt: null,
        }),
      }),
    )
  })
})

describe('clear()', () => {
  it('deletes all jobs from the DB', async () => {
    const spy = vi.spyOn(mockDb.backgroundJob, 'deleteMany')

    const adapter = new PrismaAdapter({ db: mockDb })
    await adapter.clear()

    expect(spy).toHaveBeenCalledOnce()
  })
})

describe('backoffMilliseconds()', () => {
  it('returns the number of milliseconds to wait for the next run', () => {
    expect(new PrismaAdapter({ db: mockDb }).backoffMilliseconds(0)).toEqual(0)
    expect(new PrismaAdapter({ db: mockDb }).backoffMilliseconds(1)).toEqual(
      1000,
    )
    expect(new PrismaAdapter({ db: mockDb }).backoffMilliseconds(2)).toEqual(
      16000,
    )
    expect(new PrismaAdapter({ db: mockDb }).backoffMilliseconds(3)).toEqual(
      81000,
    )
    expect(new PrismaAdapter({ db: mockDb }).backoffMilliseconds(20)).toEqual(
      160000000,
    )
  })
})