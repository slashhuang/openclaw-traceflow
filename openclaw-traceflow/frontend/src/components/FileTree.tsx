import React from 'react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  ext?: string;
  size?: number;
  children?: FileNode[] | null;
}

interface FileTreeProps {
  nodes: FileNode[];
  expandedPaths: Set<string>;
  onDirectoryClick: (node: FileNode) => void;
  onFileClick: (node: FileNode) => void;
  selectedPath: string | null;
}

export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  expandedPaths,
  onDirectoryClick,
  onFileClick,
  selectedPath,
}) => {
  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          expandedPaths={expandedPaths}
          onDirectoryClick={onDirectoryClick}
          onFileClick={onFileClick}
          selectedPath={selectedPath}
          depth={0}
        />
      ))}
    </div>
  );
};

interface FileTreeNodeProps {
  node: FileNode;
  expandedPaths: Set<string>;
  onDirectoryClick: (node: FileNode) => void;
  onFileClick: (node: FileNode) => void;
  selectedPath: string | null;
  depth: number;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  expandedPaths,
  onDirectoryClick,
  onFileClick,
  selectedPath,
  depth,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (node.type === 'directory') {
      onDirectoryClick(node);
    } else {
      onFileClick(node);
    }
  };

  const icon = getNodeIcon(node);

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="file-tree-icon">{icon}</span>
        <span className="file-tree-name">{node.name}</span>
        {node.type === 'directory' && (
          <span className="file-tree-toggle">{isExpanded ? '▼' : '▶'}</span>
        )}
      </div>
      {node.type === 'directory' && isExpanded && node.children && (
        <div className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              expandedPaths={expandedPaths}
              onDirectoryClick={onDirectoryClick}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function getNodeIcon(node: FileNode): string {
  if (node.type === 'directory') {
    return '📁';
  }

  const ext = node.ext?.toLowerCase();
  switch (ext) {
    case '.md':
      return '📝';
    case '.json':
    case '.jsonl':
      return '📋';
    case '.html':
    case '.htm':
      return '🌐';
    case '.txt':
    case '.log':
      return '📄';
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return '📜';
    case '.py':
      return '🐍';
    case '.sh':
      return '⚙️';
    default:
      return '📄';
  }
}

export default FileTree;
