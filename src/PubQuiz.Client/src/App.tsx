import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { I18nProvider } from './i18n/I18nContext';
import { LandingPage } from './pages/LandingPage';
import { ScreenPage } from './pages/ScreenPage';
import { HostPage } from './pages/HostPage';
import { DesignerPage } from './pages/DesignerPage';
import { PlayPage } from './pages/PlayPage';

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/screen" element={<ScreenPage />} />
            <Route path="/host" element={<HostPage />} />
            <Route path="/host/designer" element={<DesignerPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    </MotionConfig>
  );
}
