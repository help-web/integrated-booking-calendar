// Supabase 클라이언트 생성기를 서버/브라우저로 분리한 진입점 모듈
export { createSupabaseBrowserClient } from "@/lib/supabase/client";
export { createSupabaseServerClient } from "@/lib/supabase/server";

// 기존 이름 호환용 (추후 제거 가능)
export { createSupabaseServerClient as createSupabaseClient } from "@/lib/supabase/server";
