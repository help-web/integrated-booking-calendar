// Dashboard 컴포넌트를 메인 화면에 렌더링하는 진입점 컴포넌트입니다.
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Dashboard />
    </main>
  );
}
