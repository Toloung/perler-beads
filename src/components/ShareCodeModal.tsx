'use client';

import { useEffect, useState } from 'react';

export type ShareGenerateOptions = {
  name: string;
  visibility: 'public' | 'private';
  password?: string;
  contact?: string;
};

export type SharePanel = 'share' | 'import';

export default function ShareCodeModal({
  open,
  shareCode,
  isGenerating,
  canShare,
  projectName,
  initialPanel = 'share',
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
  onImport: (code: string, password?: string) => void;
}) {
  const [activePanel, setActivePanel] = useState<SharePanel>(initialPanel);
  const [workName, setWorkName] = useState(projectName || '未命名项目');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState('');
  const [importCode, setImportCode] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActivePanel(initialPanel);
    setWorkName(projectName || '未命名项目');
    setHasCopied(false);
  }, [initialPanel, open, projectName]);

  if (!open) return null;

  const handleGenerate = () => {
    onGenerate({
      name: workName.trim() || projectName || '未命名项目',
      visibility,
      password: visibility === 'private' ? password.trim() || undefined : undefined,
      contact: contact.trim() || undefined,
    });
  };

  const handleCopy = async () => {
    if (!shareCode) return;
    await navigator.clipboard?.writeText(shareCode);
    setHasCopied(true);
    window.setTimeout(() => setHasCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">分享作品</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">生成分享码后，其他设备可导入查看和继续编辑。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            关闭
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-gray-100 p-3 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setActivePanel('share')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              activePanel === 'share' ? 'bg-[#d97757] text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            生成分享
          </button>
          <button
            type="button"
            onClick={() => setActivePanel('import')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              activePanel === 'import' ? 'bg-[#d97757] text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            导入分享码
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          {activePanel === 'share' ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">作品名称</span>
                <input
                  value={workName}
                  onChange={(event) => setWorkName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#d97757] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="给作品起个名字"
                />
              </label>

              <section>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">分享模式</h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      visibility === 'public'
                        ? 'border-[#d97757] bg-orange-50 text-gray-900 dark:bg-orange-950/30 dark:text-white'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="block text-sm font-semibold">公开分享</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">任何人拿到分享码都能导入到画布。</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      visibility === 'private'
                        ? 'border-[#d97757] bg-orange-50 text-gray-900 dark:bg-orange-950/30 dark:text-white'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="block text-sm font-semibold">私密分享</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">需要密码才能导入，适合多人协作。</span>
                  </button>
                </div>
              </section>

              {visibility === 'private' && (
                <label className="block">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">导入密码</span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#d97757] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="输入一个给朋友的密码"
                    type="password"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">联系方式</span>
                <input
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#d97757] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="可选，仅自己记录"
                />
              </label>

              <button
                type="button"
                disabled={!canShare || isGenerating || (visibility === 'private' && !password.trim())}
                onClick={handleGenerate}
                className="w-full rounded-2xl bg-[#d97757] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c4684a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? '生成中...' : visibility === 'private' ? '生成私密分享码' : '生成公开分享码'}
              </button>

              {shareCode && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">分享成功！</h4>
                  <textarea
                    readOnly
                    value={shareCode}
                    className="mt-3 h-28 w-full resize-none rounded-xl border border-emerald-200 bg-white p-3 text-xs text-gray-700 dark:border-emerald-900 dark:bg-gray-950 dark:text-gray-200"
                  />
                  <button type="button" onClick={handleCopy} className="mt-3 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-gray-900 dark:text-emerald-200">
                    {hasCopied ? '已复制' : '复制分享码'}
                  </button>
                  {visibility === 'private' && (
                    <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">请同时保存导入密码，系统不会替你恢复密码。</p>
                  )}
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">分享码</span>
                <textarea
                  value={importCode}
                  onChange={(event) => setImportCode(event.target.value)}
                  className="mt-2 h-36 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-xs text-gray-900 outline-none transition-colors focus:border-[#d97757] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="粘贴别人发来的 perler: 分享码"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">私密密码</span>
                <input
                  value={importPassword}
                  onChange={(event) => setImportPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#d97757] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="公开分享码可留空"
                  type="password"
                />
              </label>
              <button
                type="button"
                disabled={!importCode.trim()}
                onClick={() => onImport(importCode, importPassword.trim() || undefined)}
                className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                导入到当前画布
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
