'use client';

import { useMemo, useState } from 'react';

import { ProjectSummary, SaveStatus, VersionConflict } from '../types/projectTypes';

const statusLabels: Record<SaveStatus, string> = {
  saved: '已保存',
  saving: '保存中...',
  dirty: '有未保存修改',
  error: '保存失败，请手动重试',
  conflict: '版本冲突',
  offline: '网络异常',
};

const statusClasses: Record<SaveStatus, string> = {
  saved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700',
  saving: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700',
  dirty: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
  error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700',
  conflict: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700',
  offline: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600',
};

export function ProjectToolbar({
  projectName,
  saveStatus,
  disabled,
  onSave,
  onSaveAs,
  onOpenProjects,
  onEditImage,
  onCanvasTools,
  onShare,
  onImportShare,
  onNameChange,
}: {
  projectName: string;
  saveStatus: SaveStatus;
  disabled: boolean;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenProjects: () => void;
  onEditImage?: () => void;
  onCanvasTools?: () => void;
  onShare?: () => void;
  onImportShare?: () => void;
  onNameChange: (name: string) => void;
}) {
  return (
    <section className="w-full md:max-w-4xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="sr-only" htmlFor="projectName">项目名称</label>
          <input
            id="projectName"
            value={projectName}
            onChange={(event) => onNameChange(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            placeholder="未命名项目"
          />
          <span className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium ${statusClasses[saveStatus]}`}>
            {statusLabels[saveStatus]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenProjects}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            我的项目
          </button>
          {onEditImage && (
            <button
              type="button"
              disabled={disabled}
              onClick={onEditImage}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              编辑图片
            </button>
          )}
          {onCanvasTools && (
            <button
              type="button"
              disabled={disabled}
              onClick={onCanvasTools}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              画布工具
            </button>
          )}
          {onImportShare && (
            <button
              type="button"
              onClick={onImportShare}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              导入备份码
            </button>
          )}
          {onShare && (
            <button
              type="button"
              disabled={disabled}
              onClick={onShare}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              备份
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={onSaveAs}
            className="rounded-md border border-blue-200 dark:border-blue-700 px-3 py-2 text-sm text-blue-700 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            另存为
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onSave}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </section>
  );
}

export function ProjectListModal({
  open,
  loading,
  projects,
  archivedProjects,
  onClose,
  onRefresh,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  open: boolean;
  loading: boolean;
  projects: ProjectSummary[];
  archivedProjects: ProjectSummary[];
  onClose: () => void;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onRename: (project: ProjectSummary) => void;
  onDuplicate: (project: ProjectSummary) => void;
  onArchive: (project: ProjectSummary, archived: boolean) => void;
  onDelete: (project: ProjectSummary) => void;
}) {
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'updated' | 'opened' | 'name'>('updated');

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const source = view === 'active' ? projects : archivedProjects;
    return source
      .filter(project => !normalizedQuery || project.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
        const field = sort === 'opened' ? 'last_opened_at' : 'updated_at';
        return new Date(b[field] || b.updated_at).getTime() - new Date(a[field] || a.updated_at).getTime();
      });
  }, [archivedProjects, projects, query, sort, view]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-2xl dark:bg-gray-800" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">我的项目</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">项目保存在你的私人服务器，可归档、复制和恢复。</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRefresh} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
              刷新
            </button>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
              关闭
            </button>
          </div>
        </div>
        <div className="border-b border-gray-100 p-4 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
              <button type="button" onClick={() => setView('active')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'active' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}>
                进行中 {projects.length}
              </button>
              <button type="button" onClick={() => setView('archived')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'archived' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}>
                已归档 {archivedProjects.length}
              </button>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" className="min-w-36 flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
              <option value="updated">最近修改</option>
              <option value="opened">最近打开</option>
              <option value="name">项目名称</option>
            </select>
          </div>
        </div>
        <div className="overflow-y-auto p-4">
          {loading && <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">加载中...</p>}
          {!loading && visibleProjects.length === 0 && <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{query ? '没有匹配的项目' : view === 'archived' ? '还没有归档项目' : '还没有保存过项目'}</p>}
          {!loading && visibleProjects.length > 0 && (
            <div className="grid gap-3">
              {visibleProjects.map((project) => (
                <article key={project.id} className="grid grid-cols-[72px_1fr] gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <button type="button" onClick={() => onOpen(project.id)} className="h-16 w-16 overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                    {project.thumbnail ? (
                      <img src={project.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs text-gray-400">无缩略图</span>
                    )}
                  </button>
                  <div className="min-w-0">
                    <button type="button" onClick={() => onOpen(project.id)} className="block max-w-full truncate text-left text-sm font-semibold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-300">
                      {project.name}
                    </button>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">版本 {project.version} · 修改于 {new Date(project.updated_at).toLocaleString()}</p>
                    {project.last_opened_at && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">最近打开 {new Date(project.last_opened_at).toLocaleString()}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => onOpen(project.id)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                        打开
                      </button>
                      <button type="button" onClick={() => onRename(project)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                        重命名
                      </button>
                      <button type="button" onClick={() => onDuplicate(project)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                        复制
                      </button>
                      <button type="button" onClick={() => onArchive(project, view === 'active')} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                        {view === 'active' ? '归档' : '恢复'}
                      </button>
                      <button type="button" onClick={() => onDelete(project)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30">
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConflictModal({
  conflict,
  onLoadServer,
  onOverwrite,
  onSaveAs,
}: {
  conflict: VersionConflict | null;
  onLoadServer: () => void;
  onOverwrite: () => void;
  onSaveAs: () => void;
}) {
  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">项目已在其他设备上修改</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          服务器版本是 {conflict.serverVersion}，当前页面版本是 {conflict.clientVersion}。请选择如何处理当前修改。
        </p>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={onLoadServer} className="rounded-md border border-gray-300 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
            加载服务器最新版本，放弃当前本地修改
          </button>
          <button type="button" onClick={onOverwrite} className="rounded-md border border-purple-200 px-4 py-2 text-left text-sm text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-200 dark:hover:bg-purple-900/30">
            覆盖服务器版本，保留当前本地修改
          </button>
          <button type="button" onClick={onSaveAs} className="rounded-md bg-blue-600 px-4 py-2 text-left text-sm font-medium text-white hover:bg-blue-700">
            另存为新项目
          </button>
        </div>
      </div>
    </div>
  );
}
