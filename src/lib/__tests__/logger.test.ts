import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the logger module, but since it reads env vars at call time,
// we can control behavior by setting process.env before each test.

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Reset env
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  // Fresh import each test to avoid module caching issues
  async function getLogger() {
    // Clear module cache for fresh import
    const mod = await import('../logger');
    return mod.logger;
  }

  describe('log levels', () => {
    it('should log error messages', async () => {
      const logger = await getLogger();
      logger.error('test', 'something broke');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should log warn messages', async () => {
      const logger = await getLogger();
      logger.warn('test', 'watch out');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should log info messages', async () => {
      const logger = await getLogger();
      logger.info('test', 'hello world');
      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it('should log debug messages when LOG_LEVEL=debug', async () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = await getLogger();
      logger.debug('test', 'verbose stuff');
      expect(logSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('LOG_LEVEL filtering', () => {
    it('should filter debug messages at default (info) level', async () => {
      const logger = await getLogger();
      logger.debug('test', 'should not appear');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should filter info messages when LOG_LEVEL=warn', async () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = await getLogger();
      logger.info('test', 'should not appear');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should filter warn messages when LOG_LEVEL=error', async () => {
      process.env.LOG_LEVEL = 'error';
      const logger = await getLogger();
      logger.warn('test', 'should not appear');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should always show error when LOG_LEVEL=error', async () => {
      process.env.LOG_LEVEL = 'error';
      const logger = await getLogger();
      logger.error('test', 'critical');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should show all levels when LOG_LEVEL=debug', async () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = await getLogger();
      logger.debug('test', 'dbg');
      logger.info('test', 'inf');
      logger.warn('test', 'wrn');
      logger.error('test', 'err');
      expect(logSpy).toHaveBeenCalledTimes(2); // debug + info
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('production mode (JSON output)', () => {
    it('should output JSON in production', async () => {
      process.env.NODE_ENV = 'production';
      const logger = await getLogger();
      logger.info('api', 'request handled', { status: 200 });
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('info');
      expect(parsed.module).toBe('api');
      expect(parsed.message).toBe('request handled');
      expect(parsed.status).toBe(200);
      expect(parsed.timestamp).toBeDefined();
    });

    it('should output JSON for errors in production', async () => {
      process.env.NODE_ENV = 'production';
      const logger = await getLogger();
      logger.error('db', 'connection failed', { code: 'ECONNREFUSED' });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const output = errorSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('error');
      expect(parsed.module).toBe('db');
      expect(parsed.code).toBe('ECONNREFUSED');
    });
  });

  describe('development mode (pretty output)', () => {
    it('should output pretty format in dev', async () => {
      process.env.NODE_ENV = 'development';
      const logger = await getLogger();
      logger.info('api', 'request handled', { status: 200 });
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toBe('[INFO] api: request handled');
      expect(logSpy.mock.calls[0][1]).toEqual({ status: 200 });
    });

    it('should output pretty format for warnings in dev', async () => {
      process.env.NODE_ENV = 'development';
      const logger = await getLogger();
      logger.warn('cache', 'miss');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toBe('[WARN] cache: miss');
    });

    it('should pass empty string when no context provided in dev', async () => {
      process.env.NODE_ENV = 'development';
      const logger = await getLogger();
      logger.error('test', 'oops');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toBe('[ERROR] test: oops');
      expect(errorSpy.mock.calls[0][1]).toBe('');
    });
  });
});
