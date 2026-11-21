import React from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Toast } from './components/common/Toast';
import { LandingPage } from './pages/LandingPage';
import { Overview } from './pages/Overview';
import { ImageWorkspace } from './pages/ImageWorkspace';
import { FeatureExtraction } from './pages/FeatureExtraction';
import { FeatureAnalysis } from './pages/FeatureAnalysis';
import { MedicalAnalysis } from './pages/MedicalAnalysis';
import { MethodComparison } from './pages/MethodComparison';
import { Experiments } from './pages/Experiments';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';

const WorkspaceShell: React.FC = () => {
  const { viewMode, activeTab, sidebarCollapsed } = useWorkspace();

  if (viewMode === 'landing') {
    return (
      <>
        <LandingPage />
        <Toast />
      </>
    );
  }

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'workspace':
        return <ImageWorkspace />;
      case 'features':
        return <FeatureExtraction />;
      case 'analysis':
        return <FeatureAnalysis />;
      case 'medical':
        return <MedicalAnalysis />;
      case 'comparison':
        return <MethodComparison />;
      case 'experiments':
        return <Experiments />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F7] dark:bg-[#090B0E] text-[#111C24] dark:text-[#EAECEF] transition-colors duration-200">
      {/* Spacious Floating Architectural Dock Navigation */}
      <Sidebar />

      {/* Spacious Main Content Canvas with generous breathing offset from floating dock */}
      <div
        className={`${
          sidebarCollapsed ? 'pl-[104px]' : 'pl-[104px] md:pl-[286px]'
        } flex flex-col min-h-screen transition-all duration-250 ease-out`}
      >
        <Header />

        <main className="flex-1 px-6 py-7 lg:px-10 lg:py-9">
          {renderActivePage()}
        </main>
      </div>

      {/* Global Notifications Toast */}
      <Toast />
    </div>
  );
};

export default function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
