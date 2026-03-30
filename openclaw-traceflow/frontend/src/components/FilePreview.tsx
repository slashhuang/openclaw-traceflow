import React, { useState, useEffect } from 'react';

interface FilePreviewProps {
  filePath: string;
  onClose: () => void;
}

interface FileData {
  path: string;
  name: string;
  ext: string;
  size: number;
  content: string;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ filePath, onClose }) => {
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadFile = async () => {
      setLoading(true);
      setError(null);
      setFileData(null);
      setHtmlUrl(null);

      try {
        const response = await fetch(`/api/workspace/file/${encodeURIComponent(filePath)}`);
        
        // HTML 文件特殊处理
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('text/html')) {
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
        } else {
          setFileData(data);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadFile();

    // 清理 HTML blob URL
    return () => {
      if (htmlUrl) {
        URL.revokeObjectURL(htmlUrl);
      }
    };
  }, [filePath]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          </span>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="file-preview-content">
        <pre className="file-content">
          <code>{fileData.content}</code>
        </pre>
      </div>
    </div>
  );
};

export default FilePreview;
