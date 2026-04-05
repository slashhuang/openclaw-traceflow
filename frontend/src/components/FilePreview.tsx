import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { message } from 'antd';

interface FilePreviewProps {
  filePath: string;
  onClose: () => void;
  apiPrefix?: string; // 可选，默认为 '/api/workspace'
  onFileSaved?: () => void; // 文件保存后的回调
}

interface FileData {
  path: string;
  name: string;
  ext: string;
  size: number;
  content: string;
  mtimeMs?: number; // 用于乐观并发控制
  // 大文件预览相关
  isLargeFile?: boolean;
  createdAt?: string;
  modifiedAt?: string;
  preview?: {
    head: string;
    tail: string;
    totalLines: number;
    message: string;
  };
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);

export const FilePreview: React.FC<FilePreviewProps> = ({ filePath, onClose, apiPrefix = '/api/workspace', onFileSaved }) => {
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [markdownDraft, setMarkdownDraft] = useState('');
  const [markdownMode, setMarkdownMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 加载文件
  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFileData(null);
    setHtmlUrl(null);
    setHasChanges(false);

    try {
      const response = await fetch(`${apiPrefix}/file/${encodeURIComponent(filePath)}`);

      // HTML 文件特殊处理（根据扩展名判断）
      const ext = filePath.toLowerCase().split('.').pop();
      if (ext === 'html' || ext === 'htm') {
        const htmlContent = await response.text();
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        setHtmlUrl(url);
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        message.error(`加载文件失败：${data.error}`);
      } else {
        setFileData(data);
        if (isMarkdownFile(data?.ext)) {
          setMarkdownDraft(String(data?.content || ''));
          setMarkdownMode('edit');
        } else {
          setMarkdownDraft('');
        }
      }
    } catch (err: any) {
      setError(err.message);
      message.error(`加载文件失败：${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filePath, apiPrefix]);

  useEffect(() => {
    loadFile();

    // 清理 HTML blob URL
    return () => {
      if (htmlUrl) {
        URL.revokeObjectURL(htmlUrl);
      }
    };
  }, [loadFile]);

  // 检测内容是否发生变化
  useEffect(() => {
    if (fileData) {
      const hasChanges = markdownDraft !== fileData.content;
      setHasChanges(hasChanges);
    }
  }, [markdownDraft, fileData]);

  /**
   * 保存文件
   */
  const handleSave = async () => {
    if (!hasChanges) {
      message.info('文件内容没有变化');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${apiPrefix}/file/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: markdownDraft,
          expectedMtimeMs: fileData?.mtimeMs,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '保存失败');
      }

      message.success('文件已保存');

      // 更新文件数据
      setFileData((prev) =>
        prev
          ? {
              ...prev,
              size: result.size,
              modifiedAt: result.modifiedAt,
              mtimeMs: result.mtimeMs,
              content: result.content || markdownDraft,
            }
          : null
      );

      setHasChanges(false);

      // 通知父组件文件已保存
      onFileSaved?.();
    } catch (err: any) {
      // 并发冲突提示
      if (err.message?.includes('文件已被修改')) {
        message.warning({
          content: '文件已被其他人修改，请刷新后重试',
          duration: 3,
        });
      } else {
        message.error(err.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  // 键盘快捷键保存（Ctrl/Cmd + S）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isMarkdownFile(fileData?.ext) && hasChanges && !saving) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fileData, hasChanges, saving, handleSave]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isMarkdownFile = (ext?: string): boolean => {
    if (!ext) return false;
    const normalized = String(ext).toLowerCase().replace(/^\./, '');
    return MARKDOWN_EXTENSIONS.has(normalized);
  };

  if (loading) {
    return (
      <div className="file-preview loading">
        <div className="file-preview-header">
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="file-preview-content">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-preview error">
        <div className="file-preview-header">
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="file-preview-content">
          <p className="error-message">❌ {error}</p>
        </div>
      </div>
    );
  }

  // HTML 文件用 iframe 预览
  if (htmlUrl) {
    return (
      <div className="file-preview html-preview">
        <div className="file-preview-header">
          <span className="file-name">{filePath}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="file-preview-content">
          <iframe src={htmlUrl} title={filePath} className="html-frame" />
        </div>
      </div>
    );
  }

  if (!fileData) {
    return null;
  }

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <div className="file-info">
          <span className="file-name">{fileData.name}</span>
          <span className="file-meta">
            {formatSize(fileData.size)}
            {fileData.ext && ` · ${fileData.ext}`}
            {fileData.isLargeFile && ' · ⚠️ 大文件'}
            {hasChanges && isMarkdownFile(fileData.ext) && (
              <span style={{ color: '#faad14', marginLeft: '8px' }}>● 未保存</span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isMarkdownFile(fileData.ext) && (
            <>
              <button
                className="save-btn"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                title={hasChanges ? '保存文件 (Ctrl+S)' : '无修改'}
                style={{
                  padding: '4px 12px',
                  background: !hasChanges ? '#e5e5e5' : saving ? '#1890ff99' : '#1890ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: saving || !hasChanges ? 'not-allowed' : 'pointer',
                  opacity: saving || !hasChanges ? 0.6 : 1,
                }}
              >
                {saving ? '保存中...' : '💾 保存'}
              </button>
              <span style={{ fontSize: '11px', color: 'var(--ant-color-text-secondary)' }}>
                Ctrl+S
              </span>
            </>
          )}
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="file-preview-content">
        {fileData.isLargeFile && fileData.preview && (
          <div className="large-file-notice" style={{
            padding: '12px',
            marginBottom: '16px',
            background: 'var(--ant-color-warning-bg)',
            border: '1px solid var(--ant-color-warning-border)',
            borderRadius: '6px',
            fontSize: '13px',
          }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>⚠️ 文件过大预览</strong>
            </div>
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: '12px' }}>
              <div>📊 {fileData.preview.message}</div>
              <div>📅 创建：{new Date(fileData.createdAt!).toLocaleString('zh-CN')}</div>
              <div>🕐 修改：{new Date(fileData.modifiedAt!).toLocaleString('zh-CN')}</div>
            </div>
          </div>
        )}
        {isMarkdownFile(fileData.ext) ? (
          <div className="markdown-workspace">
            <div className="markdown-mode-switch">
              <button
                className={`markdown-mode-btn ${markdownMode === 'edit' ? 'active' : ''}`}
                onClick={() => setMarkdownMode('edit')}
              >
                编辑
              </button>
              <button
                className={`markdown-mode-btn ${markdownMode === 'preview' ? 'active' : ''}`}
                onClick={() => setMarkdownMode('preview')}
              >
                预览
              </button>
            </div>
            {markdownMode === 'edit' ? (
              <textarea
                className="markdown-editor"
                value={markdownDraft}
                onChange={(e) => setMarkdownDraft(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <div className="markdown-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownDraft || ''}</ReactMarkdown>
              </div>
            )}
          </div>
        ) : (
          <pre className="file-content">
            <code>{fileData.content}</code>
          </pre>
        )}
      </div>
    </div>
  );
};

export default FilePreview;
