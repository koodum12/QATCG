/** 확장 전역에서 사용하는 간단한 로거. 컨텍스트 접두어를 붙여 추적을 돕는다. */

const PREFIX = '[AI-QA]';

export const logger = {
  info(context: string, ...args: unknown[]): void {
    console.info(`${PREFIX}[${context}]`, ...args);
  },
  warn(context: string, ...args: unknown[]): void {
    console.warn(`${PREFIX}[${context}]`, ...args);
  },
  error(context: string, ...args: unknown[]): void {
    console.error(`${PREFIX}[${context}]`, ...args);
  },
};

/** unknown 에러를 사람이 읽을 수 있는 문자열로 변환 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
