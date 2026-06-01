// Supabase 클라이언트 초기화 모듈
import { createClient } from "@supabase/supabase-js";

// TODO: Supabase 프로젝트 생성 후 .env.local에 아래 환경변수를 설정하세요.
// NEXT_PUBLIC_SUPABASE_URL=your-project-url
// NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// TODO: 백엔드 연동 시 아래 클라이언트를 export하여 사용합니다.
// export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.",
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}
