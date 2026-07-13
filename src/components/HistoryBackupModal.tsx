'use client';

import { DatabaseBackupSummary, ProjectVersionSummary } from '../types/projectTypes';

const actionLabels: Record<ProjectVersionSummary['action'], string> = {
  create: '创建',
  update: '保存',
  rename: '重命名',
  archive: '归档',
  restore: '恢复',
  delete: '删除',
};

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function HistoryBackupModal({
  open,
  loading,
  versions,
  backups,
  currentVersion,
  onClose,
  onRefresh,
  onRestore,
  onCreateBackup,
}: {
  open: boolean;
  loading: boolean;
  versions: ProjectVersionSummary[];
  backups: DatabaseBackupSummary[];
  currentVersion: number;
  onClose: () => void;
  onRefresh: () => void;
  onRestore: (version: number) => void;
  onCreateBackup: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">历史与备份</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">版本历史可恢复到新版本，数据库备份保存在服务器。</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRefresh} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              刷新
            </button>
            <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
              关闭
            </button>
          </div>
        </div>

        <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-[minmax(0,1fr)_20rem] sm:p-6">
          <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">项目版本</h4>
              <span className="text-xs text-gray-500">当前 v{currentVersion || '-'}</span>
            </div>
            {loading && <p className="py-8 text-center text-sm text-gray-500">加载中...</p>}
            {!loading && versions.length === 0 && <p className="py-8 text-center text-sm text-gray-500">还没有版本记录</p>}
            {!loading && versions.length > 0 && (
              <div className="mt-3 grid gap-2">
                {versions.map((version) => (
                  <article key={`${version.project_id}-${version.version}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        v{version.version} · {actionLabels[version.action] || version.action}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {version.name} · {new Date(version.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={version.version === currentVersion}
                      onClick={() => onRestore(version.version)}
                      className="shrink-0 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-900 dark:bg-gray-900 dark:text-blue-200"
                    >
                      恢复
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">数据库备份</h4>
              <button type="button" onClick={onCreateBackup} className="rounded-xl bg-[#d97757] px-3 py-2 text-xs font-semibold text-white hover:bg-[#c4684a]">
                创建备份
              </button>
            </div>
            {backups.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">暂无备份</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {backups.map((backup) => (
                  <article key={backup.name} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                    <p className="break-all text-sm font-semibold text-gray-900 dark:text-white">{backup.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatSize(backup.size)} · {new Date(backup.created_at).toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
