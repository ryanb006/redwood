// Parent class for any RedwoodJob-related error
export class RedwoodJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

// Thrown when trying to schedule a job without an adapter configured
export class AdapterNotConfiguredError extends RedwoodJobError {
  constructor() {
    super('No adapter configured for RedwoodJob')
  }
}

// Thrown when trying to schedule a job without a `perform` method
export class PerformNotImplementedError extends RedwoodJobError {
  constructor() {
    super('You must implement the `perform` method in your job class')
  }
}

// Thrown when a custom adapter does not implement the `schedule` method
export class NotImplementedError extends RedwoodJobError {
  constructor(name: string) {
    super(`You must implement the \`${name}\` method in your adapter`)
  }
}

// Thrown when a given model name isn't actually available in the PrismaClient
export class ModelNameError extends RedwoodJobError {
  constructor(name: string) {
    super(`Model \`${name}\` not found in PrismaClient`)
  }
}

// Thrown when the Executor is instantiated without an adapter
export class AdapterRequiredError extends RedwoodJobError {
  constructor() {
    super('`adapter` is required to perform a job')
  }
}

// Thrown when the Executor is instantiated without a job
export class JobRequiredError extends RedwoodJobError {
  constructor() {
    super('`job` is required to perform a job')
  }
}

// Thrown when a job with the given handler is not found in the filesystem
export class JobNotFoundError extends RedwoodJobError {
  constructor(name: string) {
    super(`Job \`${name}\` not found in the filesystem`)
  }
}

// Throw when a job file exists, but the export does not match the filename
export class JobExportNotFoundError extends RedwoodJobError {
  constructor(name: string) {
    super(`Job file \`${name}\` does not export a class with the same name`)
  }
}

// Thrown when the runner tries to import `adapter` from api/src/lib/jobs.js and
// the file does not exist
export class JobsLibNotFoundError extends RedwoodJobError {
  constructor() {
    super(
      'api/src/lib/jobs.js not found. Run `yarn rw setup jobs` to create this file and configure background jobs',
    )
  }
}

// Thrown when the runner tries to import `adapter` from api/src/lib/jobs.js
export class AdapterNotFoundError extends RedwoodJobError {
  constructor() {
    super('api/src/lib/jobs.js does not export `adapter`')
  }
}

// Parent class for any job where we want to wrap the underlying error in our
// own. Use by extending this class and passing the original error to the
// constructor:
//
// try {
//   throw new Error('Generic error')
// } catch (e) {
//   throw new RethrowJobError('Custom Error Message', e)
// }
export class RethrownJobError extends RedwoodJobError {
  originalError: Error
  stackBeforeRethrow: string | undefined

  constructor(message: string, error: Error) {
    super(message)

    if (!error) {
      throw new Error(
        'RethrownJobError requires a message and existing error object',
      )
    }

    this.originalError = error
    this.stackBeforeRethrow = this.stack

    const messageLines = (this.message.match(/\n/g) || []).length + 1
    this.stack =
      this.stack
        ?.split('\n')
        .slice(0, messageLines + 1)
        .join('\n') +
      '\n' +
      error.stack
  }
}

// Thrown when there is an error scheduling a job, wraps the underlying error
export class SchedulingError extends RethrownJobError {
  constructor(message: string, error: Error) {
    super(message, error)
  }
}

// Thrown when there is an error performing a job, wraps the underlying error
export class PerformError extends RethrownJobError {
  constructor(message: string, error: Error) {
    super(message, error)
  }
}
