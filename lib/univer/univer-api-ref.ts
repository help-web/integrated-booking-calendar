// Dashboard에서 등록한 Univer Facade API 참조를 배지 컴포넌트가 사용합니다.

import type { FUniver } from "@univerjs/core/facade";

let univerAPIRef: FUniver | null = null;

export function setUniverAPIRef(api: FUniver | null) {
  univerAPIRef = api;
}

export function getUniverAPIRef(): FUniver | null {
  return univerAPIRef;
}
