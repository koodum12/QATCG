import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { SCHEMA_SQL } from './schema';
import { logger } from '@/utils/logger';

/**
 * sql.js(SQLite WASM) 데이터베이스 래퍼.
 *
 * Chrome Extension에서는 Node 네이티브 모듈(better-sqlite3)을 쓸 수 없으므로
 * SQLite 공식 WASM 빌드인 sql.js를 사용하고, DB 바이트를 IndexedDB에 영속화한다.
 * Node(테스트) 환경에서는 영속화 어댑터 없이 인메모리로 동작한다.
 */

/** DB 바이트 영속화 어댑터 인터페이스 (환경별 구현 주입) */
export interface PersistenceAdapter {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
}

const IDB_NAME = 'ai-qa-sqlite';
const IDB_STORE = 'db';
const IDB_KEY = 'main';

/** IndexedDB 기반 영속화 어댑터 (background service worker에서 사용) */
export class IndexedDbAdapter implements PersistenceAdapter {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async load(): Promise<Uint8Array | null> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async save(bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
}

export interface AppDbOptions {
  /** sql-wasm.wasm 파일 위치 결정 함수 (확장에서는 chrome.runtime.getURL 사용) */
  locateFile?: (file: string) => string;
  /**
   * 미리 로드한 WASM 바이너리. MV3 service worker에는 XMLHttpRequest가 없어
   * sql.js의 기본 로더가 실패하므로, SW에서는 fetch로 직접 읽어 주입해야 한다.
   */
  wasmBinary?: ArrayBuffer;
  /** 영속화 어댑터. 미지정 시 인메모리 전용(테스트용) */
  persistence?: PersistenceAdapter;
}

/** 애플리케이션 DB. 초기화/영속화/트랜잭션 헬퍼를 제공한다. */
export class AppDb {
  private db: SqlJsDatabase;
  private persistence: PersistenceAdapter | null;

  private constructor(db: SqlJsDatabase, persistence: PersistenceAdapter | null) {
    this.db = db;
    this.persistence = persistence;
  }

  /** sql.js 초기화 → 저장된 바이트 로드(있으면) → 스키마 적용 */
  static async create(options: AppDbOptions = {}): Promise<AppDb> {
    const config: Record<string, unknown> = {};
    if (options.locateFile) config.locateFile = options.locateFile;
    // wasmBinary를 주면 Emscripten이 네트워크 로드(XHR/fetch)를 건너뛴다
    if (options.wasmBinary) config.wasmBinary = options.wasmBinary;
    const SQL = await initSqlJs(config);
    let db: SqlJsDatabase;
    const saved = options.persistence ? await options.persistence.load() : null;
    if (saved) {
      db = new SQL.Database(saved);
      logger.info('db', `기존 DB 로드 (${saved.byteLength} bytes)`);
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON;');
    db.run(SCHEMA_SQL);
    const instance = new AppDb(db, options.persistence ?? null);
    if (!saved && options.persistence) await instance.persist();
    return instance;
  }

  /** SELECT 결과를 객체 배열로 반환 */
  query<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** INSERT/UPDATE/DELETE 실행 후 영속화. INSERT면 lastInsertRowid 반환 */
  async run(sql: string, params: unknown[] = []): Promise<number> {
    this.db.run(sql, params as never[]);
    const rows = this.query<{ id: number }>('SELECT last_insert_rowid() AS id');
    await this.persist();
    return rows[0]?.id ?? 0;
  }

  /** 여러 문장을 하나의 트랜잭션으로 실행 후 1회만 영속화 */
  async transaction(fn: (exec: (sql: string, params?: unknown[]) => number) => void): Promise<void> {
    this.db.run('BEGIN TRANSACTION;');
    try {
      fn((sql, params = []) => {
        this.db.run(sql, params as never[]);
        const rows = this.query<{ id: number }>('SELECT last_insert_rowid() AS id');
        return rows[0]?.id ?? 0;
      });
      this.db.run('COMMIT;');
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    }
    await this.persist();
  }

  /** 현재 DB 바이트를 영속화 어댑터에 저장 */
  private async persist(): Promise<void> {
    if (!this.persistence) return;
    try {
      await this.persistence.save(this.db.export());
    } catch (err) {
      logger.error('db', 'DB 영속화 실패', err);
      throw err;
    }
  }

  close(): void {
    this.db.close();
  }
}
