import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden lg:block bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-10 text-white"><h2 className="mt-24 text-4xl font-bold">Future-Ready Workforce Platform</h2></div>
      <div className="flex items-center justify-center p-6"><Outlet /></div>
    </div>
  );
}


