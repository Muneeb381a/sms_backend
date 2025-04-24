/**
 * Custom application error class with enhanced features
 * @extends Error
 */
class AppError extends Error {
    /**
     * Create a new application error
     * @param {string} message 
     * @param {number} statusCode 
     * @param {Object} options 
     * @param {Object} [options.details] 
     * @param {string} [options.code] 
     * @param {boolean} [options.isOperational] 
     * @param {string} [options.context] 
     * @param {string} [options.suggestion] 
     * @param {Error} [options.cause] 
     */
    constructor(message, statusCode, options = {}) {
      super(message);
  
      this.statusCode = statusCode;
      this.isOperational = options.isOperational !== undefined ? options.isOperational : true;
      this.details = options.details || {};
      this.code = options.code;
      this.context = options.context;
      this.suggestion = options.suggestion;
      this.timestamp = new Date();
  
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      } else {
        this.stackTrace = new Error().stack;
      }
  
      if (options.cause && options.cause.stack) {
        this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
      }
  
      if (process.env.NODE_ENV === 'production') {
        Object.freeze(this);
      }
    }
  
    /**
     * Convert the error to a plain object for serialization
     */
    toJSON() {
      const base = {
        name: this.name,
        message: this.message,
        statusCode: this.statusCode,
        code: this.code,
        isOperational: this.isOperational,
        context: this.context,
        suggestion: this.suggestion,
        timestamp: this.timestamp.toISOString(),
        details: this.details,
      };
  
      if (process.env.NODE_ENV !== 'production') {
        base.stack = this.stack;
      }
  
      return base;
    }
  
    /**
     * Create an AppError from another error
     */
    static fromError(error, statusCode = 500, options = {}) {
      return new AppError(error.message, statusCode, {
        ...options,
        isOperational: false,
        cause: error,
      });
    }
  
    // Common error types as static methods
    static badRequest(message, options) {
      return new AppError(message, 400, { ...options, code: 'BAD_REQUEST' });
    }
  
    static unauthorized(message, options) {
      return new AppError(message, 401, { ...options, code: 'UNAUTHORIZED' });
    }
  
    static forbidden(message, options) {
      return new AppError(message, 403, { ...options, code: 'FORBIDDEN' });
    }
  
    static notFound(message, options) {
      return new AppError(message, 404, { ...options, code: 'NOT_FOUND' });
    }
  
    static conflict(message, options) {
      return new AppError(message, 409, { ...options, code: 'CONFLICT' });
    }
  
    static internal(message, options) {
      return new AppError(message, 500, { ...options, code: 'INTERNAL_ERROR', isOperational: false });
    }
  }
  
  export default AppError;
  