import React from 'react';
import {
  LayoutDashboard,
  ImagePlus,
  ScanSearch,
  Layers3,
  Brain,
  GitCompareArrows,
  FlaskConical,
  FileChartColumn,
  Settings2,
  PanelLeftOpen,
  PanelLeftClose,
  Box,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { TabType } from '../../types';

interface NavItem {
  id: TabType;
  label: string;
  shortLabel: string;
  group: 'core' | 'analysis' | 'records';
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: 'overview', label: 'General Overview', shortLabel: 'Overview', group: 'core', icon: LayoutDashboard },
  { id: 'workspace', label: 'Image Workspace', shortLabel: 'Workspace', group: 'core', icon: ImagePlus },
  { id: 'features', label: 'Feature Extraction', shortLabel: 'Features', group: 'analysis', icon: ScanSearch },
  { id: 'analysis', label: 'PCA & SVD Engine', shortLabel: 'PCA & SVD', group: 'analysis', icon: Layers3 },
  { id: 'medical', label: 'Medical MRI Lab', shortLabel: 'Medical', group: 'analysis', icon: Brain },
  { id: 'comparison', label: 'Method Comparison', shortLabel: 'Compare', group: 'analysis', icon: GitCompareArrows },
  { id: 'experiments', label: 'Experiments Log', shortLabel: 'Experiments', group: 'records', icon: FlaskConical },
  { id: 'reports', label: 'Scientific Reports', shortLabel: 'Reports', group: 'records', icon: FileChartColumn },
];

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    openLanding,
  } = useWorkspace();

  const handleSelectTab = (tab: TabType) => {
    setActiveTab(tab);
    if (window.innerWidth < 768 && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
  };

  return (
    <>
      {!sidebarCollapsed && (
        <div
          onClick={() => setSidebarCollapsed(true)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-3.5 bottom-3.5 left-3.5 z-40 rounded-3xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/85 shadow-xl shadow-black/5 dark:shadow-black/35 flex flex-col transition-all duration-250 ease-out ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[258px]'
        }`}
        aria-label="Primary Workspace Navigation"
      >
        {/* Top Brand Lockup */}
        <div
          className={`flex items-center h-[72px] shrink-0 border-b border-[#E5EBF0] dark:border-[#233D4D]/60 ${
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-5'
          }`}
        >
          <button
            type="button"
            onClick={() => handleSelectTab('overview')}
            className="flex items-center gap-3.5 cursor-pointer group min-w-0"
            title="ImageLab Overview"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#233D4D] border border-[#32546A] flex items-center justify-center shrink-0 group-hover:border-[#FE7F2D] transition-colors">
              <Layers3 className="w-5 h-5 text-[#FE7F2D]" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col text-left min-w-0">
                <span className="font-display text-[16px] font-bold tracking-tight text-[#111C24] dark:text-[#EAECEF] leading-none">
                  ImageLab
                </span>
                <span className="text-[11px] font-mono text-[#647888] dark:text-[#7D95A8] mt-1.5">
                  Research Studio
                </span>
              </div>
            )}
          </button>

          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#F2F4F7] dark:hover:bg-[#1A2833] transition-colors cursor-pointer shrink-0"
              title="Switch to spacious icon rail"
              aria-label="Collapse navigation rail"
            >
              <PanelLeftClose className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>

        {/* Main Spacious Navigation Rail */}
        <nav
          className={`flex-1 overflow-y-auto overflow-x-visible py-4 flex flex-col ${
            sidebarCollapsed ? 'items-center gap-2.5 px-2' : 'gap-1.5 px-3.5'
          }`}
        >
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const prevGroup = idx > 0 ? navItems[idx - 1].group : item.group;
            const showDivider = idx > 0 && prevGroup !== item.group;

            return (
              <React.Fragment key={item.id}>
                {showDivider && (
                  <div
                    className={`${
                      sidebarCollapsed ? 'w-7 my-1' : 'w-full my-2'
                    } h-px bg-[#E5EBF0] dark:bg-[#233D4D]/55 shrink-0`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex items-center transition-all cursor-pointer shrink-0 ${
                    sidebarCollapsed
                      ? `w-11 h-11 justify-center rounded-2xl ${
                          isActive
                            ? 'bg-[#233D4D] text-[#FE7F2D] ring-1 ring-[#FE7F2D]/50 shadow-sm'
                            : 'text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#EAECEF] dark:hover:bg-[#192732]'
                        }`
                      : `w-full gap-3.5 px-3.5 py-2.5 rounded-2xl text-[13.5px] font-semibold text-left ${
                          isActive
                            ? 'bg-[#233D4D] text-[#EAECEF] ring-1 ring-[#FE7F2D]/40'
                            : 'text-[#526575] dark:text-[#9BB0C1] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#F2F4F7] dark:hover:bg-[#192732]'
                        }`
                  }`}
                >
                  <Icon
                    className={`w-[19px] h-[19px] shrink-0 transition-colors ${
                      isActive
                        ? 'text-[#FE7F2D]'
                        : 'text-current group-hover:text-[#FE7F2D]'
                    }`}
                  />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}

                  {/* Clean floating hover label in collapsed iconic rail mode */}
                  {sidebarCollapsed && (
                    <span className="pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150 absolute left-[62px] z-50 px-3 py-1.5 rounded-xl bg-[#233D4D] text-[#EAECEF] text-[12px] font-semibold whitespace-nowrap shadow-lg border border-[#345970]">
                      {item.label}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Bottom Dock Utility Stack: 3D Landing, Settings, Expand */}
        <div
          className={`shrink-0 border-t border-[#E5EBF0] dark:border-[#233D4D]/60 py-3.5 flex flex-col ${
            sidebarCollapsed ? 'items-center gap-2.5 px-2' : 'gap-1.5 px-3.5'
          }`}
        >
          <button
            type="button"
            onClick={openLanding}
            title={sidebarCollapsed ? '3D Architecture Showcase' : undefined}
            aria-label="Open 3D Showcase"
            className={`group relative flex items-center transition-all cursor-pointer ${
              sidebarCollapsed
                ? 'w-11 h-11 justify-center rounded-2xl text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] hover:bg-[#EAECEF] dark:hover:bg-[#192732]'
                : 'w-full gap-3.5 px-3.5 py-2.5 rounded-2xl text-[13.5px] font-semibold text-[#526575] dark:text-[#9BB0C1] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#F2F4F7] dark:hover:bg-[#192732]'
            }`}
          >
            <Box className="w-[19px] h-[19px] shrink-0 group-hover:text-[#FE7F2D]" />
            {!sidebarCollapsed && <span className="truncate">3D Showcase</span>}
            {sidebarCollapsed && (
              <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-[62px] z-50 px-3 py-1.5 rounded-xl bg-[#233D4D] text-[#EAECEF] text-[12px] font-semibold whitespace-nowrap shadow-lg border border-[#345970]">
                3D Showcase
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('settings')}
            title={sidebarCollapsed ? 'Settings' : undefined}
            aria-label="Settings"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className={`group relative flex items-center transition-all cursor-pointer ${
              sidebarCollapsed
                ? `w-11 h-11 justify-center rounded-2xl ${
                    activeTab === 'settings'
                      ? 'bg-[#233D4D] text-[#FE7F2D] ring-1 ring-[#FE7F2D]/50'
                      : 'text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#EAECEF] dark:hover:bg-[#192732]'
                  }`
                : `w-full gap-3.5 px-3.5 py-2.5 rounded-2xl text-[13.5px] font-semibold ${
                    activeTab === 'settings'
                      ? 'bg-[#233D4D] text-[#EAECEF] ring-1 ring-[#FE7F2D]/40'
                      : 'text-[#526575] dark:text-[#9BB0C1] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#F2F4F7] dark:hover:bg-[#192732]'
                  }`
            }`}
          >
            <Settings2
              className={`w-[19px] h-[19px] shrink-0 ${
                activeTab === 'settings' ? 'text-[#FE7F2D]' : 'group-hover:text-[#FE7F2D]'
              }`}
            />
            {!sidebarCollapsed && <span className="truncate">Settings</span>}
            {sidebarCollapsed && (
              <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-[62px] z-50 px-3 py-1.5 rounded-xl bg-[#233D4D] text-[#EAECEF] text-[12px] font-semibold whitespace-nowrap shadow-lg border border-[#345970]">
                Settings
              </span>
            )}
          </button>

          {sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              title="Expand navigation labels"
              aria-label="Expand navigation rail"
              className="group relative w-11 h-11 rounded-2xl flex items-center justify-center text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] hover:bg-[#EAECEF] dark:hover:bg-[#192732] transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-[18px] h-[18px]" />
              <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-[62px] z-50 px-3 py-1.5 rounded-xl bg-[#233D4D] text-[#EAECEF] text-[12px] font-semibold whitespace-nowrap shadow-lg border border-[#345970]">
                Expand Menu
              </span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
