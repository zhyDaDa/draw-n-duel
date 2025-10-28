import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SettingsProvider } from "./context/SettingsContext";
import "./App.css";

const EntrancePage = lazy(() => import("./pages/EntrancePage"));
const GamePlayPage = lazy(() => import("./pages/GamePlayPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

const App: React.FC = () => {
  return (
    <SettingsProvider>
      <Suspense fallback={<div className="page-loading">加载中…</div>}>
        <Routes>
          <Route index element={<EntrancePage />} />
          <Route path="entrance" element={<EntrancePage />} />
          <Route path="game_play" element={<GamePlayPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </SettingsProvider>
  );
};

export default App;
