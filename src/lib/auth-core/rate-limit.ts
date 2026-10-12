// 실패 횟수 제한기 (순수 모듈, 인메모리). 서버리스에서는 인스턴스마다 따로 센다(인스턴스 로컬) — 다른 인스턴스로 분산된 시도는 막지 못하므로
// 비상용 로그인을 쓰지 않을 때는 AUTH_ENABLE_CREDENTIALS 를 꺼 두는 것이 기본이다.

export interface AttemptLimiter {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
  reset(key: string): void;
}

export function createAttemptLimiter(opts: {
  maxFailures: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}): AttemptLimiter {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 1000;
  const state = new Map<string, { count: number; resetAt: number }>();

  function live(key: string): { count: number; resetAt: number } | undefined {
    const entry = state.get(key);
    if (!entry) return undefined;
    if (entry.resetAt <= now()) {
      state.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked(key) {
      const entry = live(key);
      return entry !== undefined && entry.count >= opts.maxFailures;
    },
    recordFailure(key) {
      const entry = live(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (state.size >= maxKeys) {
        const t = now();
        for (const [k, e] of state) if (e.resetAt <= t) state.delete(k);
        while (state.size >= maxKeys) {
          const oldest = state.keys().next();
          if (oldest.done) break;
          state.delete(oldest.value);
        }
      }
      state.set(key, { count: 1, resetAt: now() + opts.windowMs });
    },
    reset(key) {
      state.delete(key);
    },
  };
}
