'use client';

import { SaveStatus } from '../types/projectTypes';

const mascotRows = [
  '....PP.VV....',
  '..PRRPVBB....',
  '.PRRWPVBWB...',
  '.PRWR.O.BW...',
  '..PPOOO.V...',
  '...OOWOOO...',
  '.CCOOWOOCG..',
  '.CBBOOOGG...',
  '..CC..G....',
];

const beadColors: Record<string, string> = {
  P: '#ec4899',
  R: '#f43f5e',
  V: '#a855f7',
  B: '#3b82f6',
  O: '#f97316',
  W: '#ffffff',
  C: '#06b6d4',
  G: '#22c55e',
  '.': 'rgba(209, 213, 219, 0.16)',
};

const statusText: Record<SaveStatus, string> = {
  saved: '已保存',
  saving: '保存中',
  dirty: '未保存',
  error: '保存失败',
  conflict: '版本冲突',
  offline: '网络异常',
};

function BeadMascot() {
  return (
    <div className="modern-welcome-mascot grid gap-[2px] sm:gap-[4px]" style={{ gridTemplateColumns: 'repeat(13, auto)' }}>
      {mascotRows.flatMap((row, rowIndex) =>
        row.split('').map((cell, colIndex) => (
          <span
            key={`${rowIndex}-${colIndex}`}
            className="h-[10px] w-[10px] rounded-full sm:h-[18px] sm:w-[18px]"
            style={{
              backgroundColor: beadColors[cell],
              boxShadow: cell === '.' ? 'none' : 'inset 0 -1px 2px rgba(0,0,0,0.16)',
            }}
          />
        ))
      )}
    </div>
  );
}

export default function ModernWorkspaceShell({
  selectedColorSystem,
  colorCount,
  saveStatus,
  hasCanvas,
  onUpload,
  onCreateBlank,
  onOpenProjects,
  onSave,
  onSaveAs,
  onDownload,
  onShare,
  onImportShare,
}: {
  selectedColorSystem: string;
  colorCount: number;
  saveStatus: SaveStatus;
  hasCanvas: boolean;
  onUpload: () => void;
  onCreateBlank: () => void;
  onOpenProjects: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDownload: () => void;
  onShare: () => void;
  onImportShare: () => void;
}) {
  return (
    <div className="modern-workspace w-full">
      <header className="sticky top-0 z-40 w-full px-2 pb-1 pt-2 sm:px-4">
        <div className="modern-glass mx-auto flex min-h-14 w-full max-w-screen-2xl flex-wrap items-center gap-2 rounded-2xl px-2 py-1.5 sm:gap-3">
          <button type="button" className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg active:opacity-70" title="回到首页">
            <span className="grid grid-cols-2 gap-0.5 rounded-lg bg-white/55 p-1.5 dark:bg-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          </button>

          <div className="min-w-[2rem] flex-1" />

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 sm:gap-1.5">
            <button type="button" className="flex min-h-10 flex-col items-start rounded-xl bg-white/50 px-2 py-1 text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-2.5" title={`色板设置 · ${selectedColorSystem} · ${colorCount} 色`}>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">{selectedColorSystem}</span>
              <span className="text-[11px] font-semibold">{colorCount}</span>
            </button>
            <button type="button" onClick={onOpenProjects} className="min-h-10 rounded-xl bg-white/50 px-2.5 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-3">
              我的项目
            </button>
            <button type="button" onClick={onUpload} className="min-h-10 rounded-xl bg-white/50 px-3 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-4">
              导入
            </button>
            <button type="button" onClick={onDownload} disabled={!hasCanvas} className="min-h-10 rounded-xl bg-white/50 px-3 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 disabled:opacity-40 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:min-h-[44px] sm:px-4">
              下载
            </button>
            <button type="button" onClick={onSave} disabled={!hasCanvas || saveStatus === 'saving'} className="min-h-10 rounded-xl bg-[#d97757] px-3 text-xs font-semibold text-white transition-colors active:bg-[#c4684a] disabled:bg-[#d97757]/40 disabled:text-white/70 sm:min-h-[44px] sm:px-4">
              {saveStatus === 'saving' ? '保存中' : '保存'}
            </button>
            <button type="button" onClick={onShare} disabled={!hasCanvas} className="hidden min-h-10 rounded-xl bg-white/50 px-2.5 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 disabled:opacity-40 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:block sm:min-h-[44px] sm:px-3">
              分享
            </button>
            <button type="button" onClick={onSaveAs} disabled={!hasCanvas} className="hidden min-h-10 rounded-xl bg-white/50 px-2.5 text-xs font-medium text-gray-700 transition-colors active:bg-white/70 disabled:opacity-40 dark:bg-white/5 dark:text-gray-200 dark:active:bg-white/10 sm:block sm:min-h-[44px] sm:px-3">
              另存
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-screen-2xl gap-3 px-2 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="modern-stage min-h-[360px] overflow-hidden rounded-2xl">
          {!hasCanvas && (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-4 sm:p-8">
              <div className="flex w-full max-w-2xl flex-col items-center gap-6 sm:w-auto sm:flex-row sm:gap-14">
                <BeadMascot />
                <div className="modern-welcome-content flex w-full flex-col items-center gap-4 sm:w-auto sm:items-start sm:gap-6">
                  <div className="space-y-1.5 text-center sm:space-y-2 sm:text-left">
                    <h1 className="text-2xl font-bold tracking-wide text-gray-800 dark:text-gray-100 sm:text-3xl">拼豆</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      底稿生成器 <span className="font-semibold text-[#d97757]">私有同步版</span>
                    </p>
                    <p className="mt-2 text-sm font-medium tracking-widest text-[#c4684a] dark:text-[#e8a48c] sm:mt-3 sm:text-[15px]">
                      让像素创意属于每一个人
                    </p>
                  </div>

                  <div className="flex w-full max-w-72 flex-col items-center">
                    <button type="button" onClick={onUpload} className="min-h-[48px] w-full rounded-lg bg-[#d97757] px-4 py-3 text-sm font-semibold text-gray-50 transition-colors active:bg-[#c4684a] sm:min-h-[52px] sm:py-3.5">
                      上传图片 / 导入底稿
                    </button>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs sm:mt-5 sm:gap-3 sm:text-[13px]">
                      <button type="button" onClick={onCreateBlank} className="font-medium text-[#c4684a] transition-colors active:text-[#d97757]">空白画布创建</button>
                      <span className="text-gray-400 dark:text-gray-500">·</span>
                      <button type="button" onClick={onOpenProjects} className="font-medium text-[#c4684a] transition-colors active:text-[#d97757]">我的项目</button>
                      <span className="text-gray-400 dark:text-gray-500">·</span>
                      <button type="button" onClick={onImportShare} className="font-medium text-[#c4684a] transition-colors active:text-[#d97757]">分享码导入</button>
                    </div>
                    <button type="button" className="mt-4 text-xs text-gray-500 transition-colors active:text-[#d97757] dark:text-gray-400 sm:mt-5">
                      色板 {selectedColorSystem} · {colorCount} 色 · {statusText[saveStatus]}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="modern-side-panel hidden rounded-2xl xl:flex">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
            <section className="rounded-xl border border-white/50 bg-white/40 dark:border-white/10 dark:bg-white/5">
              <div className="px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">留言</h2>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-200/60 bg-gray-50/80 shadow-sm dark:border-gray-800/50 dark:bg-gray-800/80">
                    <span className="text-[#d97757]">★</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">私有工作台</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">已接入服务器端项目保存。</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">电脑和手机访问同一网址，可打开同一份图纸继续修改。</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">保存状态：{statusText[saveStatus]}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">🔒</span>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">私有保存声明</h2>
              </div>
              <div className="space-y-2 text-xs leading-[1.8] text-gray-600 dark:text-gray-300">
                <p>图片处理仍在浏览器内完成；项目状态会保存到你部署的私人服务器 SQLite。</p>
                <p>公网访问建议继续使用 Nginx Basic Auth 保护，避免他人上传或占用资源。</p>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200/60 bg-gray-50/95 p-4 shadow-sm dark:border-gray-800/50 dark:bg-gray-900/80">
              <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">项目操作</h2>
              <button type="button" onClick={onOpenProjects} className="w-full rounded-lg bg-gradient-to-r from-[#d97757] to-[#c4684a] px-4 py-2.5 text-white shadow-md transition-all duration-300 active:shadow-lg">
                打开我的项目
              </button>
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">自动保存、版本冲突提示和另存为会继续在这里生效。</p>
            </section>
          </div>
        </aside>
      </section>
    </div>
  );
}
