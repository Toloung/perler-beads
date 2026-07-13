'use client';

import { useEffect, useState } from 'react';

export type ShareGenerateOptions = {
  name: string;
};

export type SharePanel = 'export' | 'import';

export default function ShareCodeModal({
  open,
  shareCode,
  isGenerating,
  canShare,
  projectName,
  initialPanel = 'export',
  onClose,
  onGenerate,
  onImport,
}: {
  open: boolean;
  shareCode: string;
  isGenerating: boolean;
  canShare: boolean;
  projectName: string;
  initialPanel?: SharePanel;
  onClose: () => void;
  onGenerate: (options: ShareGenerateOptions) => void;
  onImport: (code: string) => void;
}) {
  const [activePanel, setActivePanel] = useState<SharePanel>(initialPanel);
  const [backupName, setBackupName] = useState(projectName || '未命名项目');
  const [importCode, setImportCode] = useState('');
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActivePanel(initialPanel);
    setBackupName(projectName || '未命名项目');
    setHasCopied(false);
  }, [initialPanel, open, projectName]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!shareCode) return;
    await navigator.clipboard?.writeText(shareCode);
    setHasCopied(true);
    window.setTimeout(() => setHasCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">项目备份码</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">用于在自己的设备间迁移或留存项目副本。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            关闭
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-gray-100 p-3 dark:border-gray-800">
          <button type="button" onClick={() => setActivePanel('export')} className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${activePanel === 'export' ? 'bg-[#d97757] text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
            导出备份码
          </button>
          <button type="button" onClick={() => setActivePanel('import')} className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${activePanel === 'import' ? 'bg-[#d97757] text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
            导入备份码
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          {activePanel === 'export' ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">备份名称</span>
                <input value={backupName} onChange={(event) => setBackupName(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#d97757] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" placeholder="未命名项目" />
              </label>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                备份码包含当前项目状态和图片数据，内容可能较长。请只保存到自己信任的位置。
              </p>
              <button type="button" disabled={!canShare || isGenerating} onClick={() => onGenerate({ name: backupName.trim() || projectName || '未命名项目' })} className="w-full rounded-xl bg-[#d97757] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c4684a] disabled:cursor-not-allowed disabled:opacity-50">
                {isGenerating ? '生成中...' : '生成备份码'}
              </button>
              {shareCode && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">备份码已生成</h4>
                  <textarea readOnly value={shareCode} className="mt-3 h-28 w-full resize-none rounded-xl border border-emerald-200 bg-white p-3 text-xs text-gray-700 dark:border-emerald-900 dark:bg-gray-950 dark:text-gray-200" />
                  <button type="button" onClick={handleCopy} className="mt-3 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-gray-900 dark:text-emerald-200">
                    {hasCopied ? '已复制' : '复制备份码'}
                  </button>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">备份码</span>
                <textarea value={importCode} onChange={(event) => setImportCode(event.target.value)} className="mt-2 h-40 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-xs text-gray-900 outline-none transition-colors focus:border-[#d97757] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" placeholder="粘贴 perler-backup: 开头的备份码" />
              </label>
              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">导入后会作为新的未保存副本打开；确认无误后再保存到服务器。</p>
              <button type="button" disabled={!importCode.trim()} onClick={() => onImport(importCode)} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                导入为副本
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
