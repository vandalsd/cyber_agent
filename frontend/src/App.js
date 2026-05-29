import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/api";
import Login from "@/pages/Login";
import DashboardLayout from "@/components/DashboardLayout";
import Console from "@/pages/Console";
import Agents from "@/pages/Agents";
import Sessions from "@/pages/Sessions";
import Reports from "@/pages/Reports";
import Logs from "@/pages/Logs";
import Health from "@/pages/Health";
import { Toaster } from "sonner";

function Protected({ children }) {
  const [hasToken, setHasToken] = useState(!!getToken());
  useEffect(() => {
    const interval = setInterval(() => setHasToken(!!getToken()), 500);
    return () => clearInterval(interval);
  }, []);
  if (!hasToken) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App grain">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <DashboardLayout />
              </Protected>
            }
          >
            <Route index element={<Console />} />
            <Route path="agents" element={<Agents />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="logs" element={<Logs />} />
            <Route path="health" element={<Health />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#0a0a0c",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
          },
        }}
      />
    </div>
  );
}

export default App;
