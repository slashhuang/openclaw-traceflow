import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#10B981', '#F59E0B', '#F97316', '#EF4444'];

export default function SystemPromptOptimization() {
  const [analysis, setAnalysis] = useState(null);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [analysisRes, skillsRes] = await Promise.all([
        fetch('/api/skills/system-prompt/analysis'),
        fetch('/api/skills/usage')
      ]);
      
      const analysisData = await analysisRes.json();
      const skillsData = await skillsRes.json();
      
      setAnalysis(analysisData);
      setSkills(skillsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  if (!analysis) {
    return <div className="p-6 text-center text-gray-500">暂无数据</div>;
  }

  const totalKB = analysis.totalBytes ? (analysis.totalBytes / 1024).toFixed(1) : null;
  const contextWindow = 200000;
  const usagePercent = analysis.estimatedTokens
    ? Math.round((analysis.estimatedTokens / contextWindow) * 100)
    : null;
  const controllableBytes = analysis.layers
    ?.filter((l) => l.controllable)
    .reduce((s, l) => s + l.bytes, 0) ?? 0;
  const teamCustomPercent = analysis.totalBytes
    ? Math.round((controllableBytes / analysis.totalBytes) * 100)
    : null;

  // Token 分布数据（按 layers 或 fallback 到 skills）
  const tokenDistribution = analysis.layers?.length
    ? analysis.layers
        .filter((l) => l.tokenCount > 0)
        .map((l) => ({ name: l.label, value: l.tokenCount, color: l.color }))
    : [
        { name: '活跃 Skills', value: analysis.activeSkillsTokens, color: '#10B981' },
        { name: '僵尸 Skills', value: analysis.zombieSkillsTokens, color: '#EF4444' },
        { name: '重复 Skills', value: analysis.duplicateSkillsTokens, color: '#F59E0B' },
      ];

  // 僵尸 Skills
  const zombieSkills = skills.filter(s => s.lastUsed && s.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // 重复 Skills
  const duplicateSkills = skills.filter(s => s.duplicateWith && s.duplicateWith.length > 0);

  // 优化后的预估
  const displayTokens = analysis.estimatedTokens ?? analysis.totalTokens ?? 0;
  const optimizedTotal = displayTokens - analysis.savings;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">SystemPrompt 分析</h1>
        <p className="text-gray-600 mt-1">分析 SystemPrompt 结构，识别优化空间</p>
      </div>

      {/* 紧凑概览（与 dashboard 对齐） */}
      {totalKB != null && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <span>
              <strong>{totalKB} KB</strong> ≈ {(analysis.estimatedTokens || analysis.totalTokens).toLocaleString()} tokens
            </span>
            {usagePercent != null && (
              <span>
                Context Window: <strong>{usagePercent}%</strong> of Claude 4.6 Opus (200K)
              </span>
            )}
            {teamCustomPercent != null && (
              <span>
                团队自定义: <strong>{teamCustomPercent}%</strong>{' '}
                <span className="text-gray-500 text-sm">(Preset + Skills + Memory)</span>
              </span>
            )}
          </div>
          {analysis.layers?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {analysis.layers.map((layer) => {
                const pct = analysis.totalBytes ? (layer.bytes / analysis.totalBytes * 100).toFixed(1) : 0;
                const kb = (layer.bytes / 1024).toFixed(1);
                return (
                  <span
                    key={layer.id}
                    className="inline-flex items-center gap-1.5 text-sm"
                    title={`${layer.label}: ${kb}KB (${pct}%)`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: layer.color }}
                    />
                    {layer.label} {kb}KB ({pct}%)
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Token 分布概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 饼图 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Token 分布</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={tokenDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value.toLocaleString()} tokens`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {tokenDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => value.toLocaleString()} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 优化建议摘要 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">优化效果预估</h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b">
              <span className="text-gray-600">当前 SystemPrompt</span>
              <span className="text-xl font-bold text-gray-900">{displayTokens.toLocaleString()} tokens</span>
            </div>
            
            <div className="flex justify-between items-center pb-3 border-b">
              <span className="text-gray-600">优化后 SystemPrompt</span>
              <span className="text-xl font-bold text-green-600">{optimizedTotal.toLocaleString()} tokens</span>
            </div>
            
            <div className="flex justify-between items-center pt-3">
              <span className="text-gray-600">可节省</span>
              <div className="text-right">
                <span className="text-xl font-bold text-green-600">{analysis.savings.toLocaleString()} tokens</span>
                <span className="ml-2 text-sm text-green-600">({analysis.savingsPercent}%)</span>
              </div>
            </div>
          </div>

          {/* 具体建议 */}
          <div className="mt-6">
            <h3 className="font-medium mb-3">优化建议：</h3>
            <ul className="space-y-2">
              {analysis.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start bg-gray-50 rounded p-3">
                  <span className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-medium mr-3">
                    {index + 1}
                  </span>
                  <span className="text-gray-700">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 完整 System Prompt（Markdown 渲染） */}
      {analysis.assembledPrompt && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">完整 System Prompt</h2>
            <p className="text-sm text-gray-500 mt-1">按注入顺序展示，支持 Markdown 渲染</p>
          </div>
          <div className="p-6 overflow-x-auto">
            <div className="system-prompt-markdown">
              <ReactMarkdown>{analysis.assembledPrompt}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* 僵尸 Skills */}
      {zombieSkills.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-red-600">僵尸 Skills（30 天未使用）</h2>
            <span className="text-sm text-gray-500">共 {zombieSkills.length} 个，可节省 {analysis.zombieSkillsTokens.toLocaleString()} tokens</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Token</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">最后使用</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {zombieSkills.map((skill, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{skill.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 max-w-md truncate">{skill.description}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{skill.tokenCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {skill.lastUsed ? new Date(skill.lastUsed).toLocaleDateString() : '从未'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button className="text-sm text-red-600 hover:text-red-800">移除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 重复 Skills */}
      {duplicateSkills.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-orange-600">重复 Skills</h2>
            <span className="text-sm text-gray-500">共 {duplicateSkills.length} 个，可节省 {analysis.duplicateSkillsTokens.toLocaleString()} tokens</span>
          </div>
          <div className="p-6 space-y-4">
            {duplicateSkills.map((skill, index) => (
              <div key={index} className="border border-orange-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{skill.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{skill.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">{skill.tokenCount} tokens</div>
                    <div className="text-xs text-orange-600">重复：{skill.duplicateWith?.join(', ')}</div>
                  </div>
                </div>
                
                {/* 触发条件对比 */}
                <div className="mt-3">
                  <div className="text-sm text-gray-600 mb-2">触发条件：</div>
                  <div className="flex flex-wrap gap-2">
                    {skill.triggers?.map((trigger, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {trigger}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 优化建议 */}
                <div className="mt-3 flex justify-end space-x-2">
                  <button className="text-sm text-orange-600 hover:text-orange-800">查看详情</button>
                  <button className="text-sm text-blue-600 hover:text-blue-800">合并</button>
                  <button className="text-sm text-red-600 hover:text-red-800">移除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 所有 Skills 列表 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">所有 Skills（{skills.length}个）</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Token</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">调用次数</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">警告</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {skills.map((skill, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{skill.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      skill.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {skill.enabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{skill.tokenCount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{skill.callCount}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {skill.duplicateWith && skill.duplicateWith.length > 0 && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 mr-2">
                        重复
                      </span>
                    )}
                    {skill.lastUsed && skill.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000 && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        僵尸
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
