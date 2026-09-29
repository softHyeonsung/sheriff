// mobile/src/lib/jsonFile.ts
// 폰에 두는 작은 JSON 파일 하나. 백그라운드 태스크와 화면이 같이 고쳐도 서로 덮어쓰지 않게
// 읽고-고쳐-쓰기를 파일마다 한 줄로 세운다.
import { File, Paths } from 'expo-file-system';

export type JsonFile<T> = {
  read(): Promise<T>;
  update(fn: (d: T) => Promise<T | null>): Promise<void>;
};

export function jsonFile<T>(name: string, parse: (raw: unknown) => T): JsonFile<T> {
  const file = () => new File(Paths.document, name);
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<T> {
    let raw: unknown;
    try {
      const f = file();
      if (f.exists) raw = JSON.parse(await f.text());
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

  return { read, update };
}
