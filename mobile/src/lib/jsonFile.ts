// mobile/src/lib/jsonFile.ts
// 폰에 두는 작은 JSON 파일 하나. 백그라운드 태스크와 화면이 같이 고쳐도 서로 덮어쓰지 않게
// 읽고-고쳐-쓰기를 파일마다 한 줄로 세운다.
import { File, Paths } from 'expo-file-system';

export type JsonFile<T> = {
  read(): Promise<T>;
  update(fn: (d: T) => Promise<T | null>): Promise<void>;
  clear(): Promise<void>;
};

export function jsonFile<T>(name: string, parse: (raw: unknown) => T): JsonFile<T> {
  const file = () => new File(Paths.document, name);
  let queue: Promise<unknown> = Promise.resolve();

  // 없거나 깨진 파일은 빈 값(parse(undefined)). 읽기 자체가 실패하면 던진다 — 빈 값으로 보고
  // 덮어쓰면 챙겨둔 것을 지우게 된다.
  async function read(): Promise<T> {
    const f = file();
    if (!f.exists) return parse(undefined);
    const text = await f.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = undefined; // 깨진 파일: 빈 값으로 시작하는 게 앱이 멈추는 것보다 낫다
    }
    return parse(raw);
  }

  function update(fn: (d: T) => Promise<T | null>): Promise<void> {
    const run = queue.then(async () => {
      const next = await fn(await read());
      if (!next) return;
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify(next));
    });
    queue = run.catch(() => {}); // 앞 작업이 실패해도 줄은 계속
    return run;
  }

  // 같은 줄에 세워서, 진행 중인 쓰기가 지운 뒤에 되살리지 않게.
  function clear(): Promise<void> {
    const run = queue.then(() => {
      const f = file();
      if (f.exists) f.delete();
    });
    queue = run.catch(() => {});
    return run;
  }

  return { read, update, clear };
}
