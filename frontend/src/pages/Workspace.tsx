import React, { useState, useEffect, useCallback } from 'react';
import { FileTree } from '../components/FileTree';
import { FilePreview } from '../components/FilePreview';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  ext?: string;
  size?: number;
  children?: FileNode[] | null;
}

interface TreeData {
  path: string;
  absolutePath: string;
  children: FileNode[];
}

export const Workspace: React.FC = () => {
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  /**
   * 加载目录树
   */
  const loadTree = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      const response = await fetch(`/api/workspace/tree${params}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setTreeData(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 加载子目录（懒加载）
   */
  const loadChildren = useCallback(async (node: FileNode): Promise<FileNode[]> => {
    if (node.type !== 'directory' || node.children !== null) {
      return node.children || [];
    }

    try {
      const response = await fetch(`/api/workspace/tree?path=${encodeURIComponent(node.path)}`);
      const data = await response.json();
      return data.children || [];
    } catch (err) {
      console.error('Failed to load children:', err);
      return [];
    }
  }, []);

  /**
   * 处理目录点击（展开/收起）
   */
  const handleDirectoryClick = useCallback(async (node: FileNode) => {
    const newPath = node.path;
    const isExpanded = expandedPaths.has(newPath);

    if (isExpanded) {
      // 收起
      const newExpanded = new Set(expandedPaths);
      newExpanded.delete(newPath);
      setExpandedPaths(newExpanded);
    } else {
      // 展开
      const newExpanded = new Set(expandedPaths);
      newExpanded.add(newPath);
      setExpandedPaths(newExpanded);

      // 懒加载子节点
      if (node.children === null) {
        const children = await loadChildren(node);
        if (treeData) {
          // 更新树数据中的节点
          const updatedTree = updateNodeInTree(treeData, node.path, { children });
          setTreeData(updatedTree);
        }
      }
    }
  }, [expandedPaths, loadChildren, treeData]);

  /**
   * 处理文件点击（预览）
   */
  const handleFileClick = useCallback((node: FileNode) => {
    setSelectedFile(node.path);
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  if (loading && !treeData) {
    return <div className="workspace-loading">加载中...</div>;
  }

  if (error && !treeData) {
    // 判断是否是目录不存在
    const isNotFound = error.includes('ENOENT') || error.includes('no such file');
    return (
      <div className="workspace-error">
        <h3>加载失败</h3>
        <p>{isNotFound ? 'Workspace 目录不存在，请配置 OPENCLAW_WORKSPACE_DIR 环境变量' : error}</p>
        <button onClick={() => loadTree()}>重试</button>
      </div>
    );
  }

  // 空目录提示
  if (treeData && treeData.children.length === 0) {
    return (
      <div className="workspace-empty">
        <p>📂 此目录为空</p>
      </div>
    );
  }

  return (
    <div className="workspace-container">
      <div className="workspace-sidebar">
        <div className="workspace-header">
          <h3>Workspace</h3>
          <button onClick={() => loadTree()} title="刷新">
            🔄
          </button>
        </div>
        {treeData && (
          <>
            <div className="workspace-path-info">
              <div className="workspace-path-header">
                <span className="workspace-path-label">📂</span>
                <span>根目录</span>
              </div>
              <div className="workspace-path" title={treeData.absolutePath}>
                {treeData.absolutePath}
              </div>
            </div>
            {treeData.path !== '.' && (
              <div className="workspace-current-path">
                <span>📍 当前：</span>
                <code>{treeData.path}</code>
              </div>
            )}
            <FileTree
              nodes={treeData.children}
              expandedPaths={expandedPaths}
              onDirectoryClick={handleDirectoryClick}
              onFileClick={handleFileClick}
              selectedPath={selectedFile}
            />
          </>
        )}
      </div>
      <div className="workspace-content">
        {selectedFile ? (
          <FilePreview filePath={selectedFile} onClose={() => setSelectedFile(null)} onFileSaved={() => loadTree()} />
        ) : (
          <div className="workspace-empty">
            <p>选择一个文件进行预览</p>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 更新树中的节点（不可变方式）
 */
function updateNodeInTree(tree: TreeData, targetPath: string, updates: Partial<FileNode>): TreeData {
  return {
    ...tree,
    children: updateNodes(tree.children, targetPath, updates),
  };
}

function updateNodes(nodes: FileNode[], targetPath: string, updates: Partial<FileNode>): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, ...updates };
    }
    if (node.type === 'directory' && node.children) {
      return { ...node, children: updateNodes(node.children, targetPath, updates) };
    }
    return node;
  });
}

export default Workspace;
