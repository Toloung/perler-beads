'use client';

import { useState } from 'react';

export default function ShareCodeModal({
  open,
  shareCode,
  isGenerating,
  canShare,
  onClose,
  onGenerate,
  onImport,
}: {
  open: boolean;
  shareCode: string;
  isGenerating: boolean;
  canShare: boolean;
  onClose: () => void;
  onGenerate: (password?: string) => void;
  onImport: (code: string, password?: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [importCode, setImportCode] = useState('');
  const [importPassword, setImportPassword] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-2xl dark:bg-gray-800" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">分享码</h3>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
            关闭
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto p-4">
          <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">导出当前作品</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">留空密码为公开分享码；填写密码会生成私密分享码。</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder="可选密码"
                type="password"
              />
              <button
                type="button"
                disabled={!canShare || isGenerating}
                onClick={() => onGenerate(password.trim() || undefined)}
                className="rounded-md bg-[#d97757] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? '生成中' : '生成分享码'}
              </button>
            </div>
            {shareCode && (
              <div className="mt-3">
                <textarea
                  readOnly
                  value={shareCode}
                  className="h-28 w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(shareCode)}
                  className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  复制分享码
                </button>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">导入分享码</h4>
            <textarea
              value={importCode}
              onChange={(event) => setImportCode(event.target.value)}
              className="mt-3 h-28 w-full resize-none rounded-md border border-gray-300 bg-white p-3 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="粘贴分享码"
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={importPassword}
                onChange={(event) => setImportPassword(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder="私密分享码密码，可选"
                type="password"
              />
              <button
                type="button"
                disabled={!importCode.trim()}
                onClick={() => onImport(importCode, importPassword.trim() || undefined)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                导入
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
