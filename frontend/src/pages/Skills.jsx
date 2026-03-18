import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function Skills() {
  const [skills, setSkills] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'analysis'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [skillsRes, systemPromptRes] = await Promise.all([
        fetch('/api/skills/usage'),
        fetch('/api/skills/system-prompt/analysis')
      ]);
      
      const skillsData = await skillsRes.json();
      const systemPromptData = await systemPromptRes.json();
      
      setSkills(skillsData);
      setSystemPrompt(systemPromptData);
    } catch (error) {
      console.error('Failed to fetch skills data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 准备图表数据
  const callFrequencyData = skills
    .filter(s => s.callCount > 0)
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 10)
    .map(s => ({ name: s.name, count: s.callCount }));

  const tokenDistributionData = [
    { name: '活跃 Skills', value: systemPrompt?.activeSkillsTokens || 0 },
    { name: '僵尸 Skills', value: systemPrompt?.zombieSkillsTokens || 0 },
    { name: '重复 Skills', value: systemPrompt?.duplicateSkillsTokens || 0 },
  ];

  const zombieSkills = skills.filter(s => s.lastUsed && s.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000);
  const duplicateSkills = skills.filter(s => s.duplicateWith && s.duplicateWith.length > 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Skills 使用分析</h1>
        <p className="text-gray-600 mt-1">分析 skills 调用频率、识别僵尸 skills 和重复 skills</p>
      </div>

      {/* 标签页 */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('list')}
            className={`${activeTab === 'list' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Skills 清单
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`${activeTab === 'analysis' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            SystemPrompt 分析
          </button>
        </nav>
      </div>

      {activeTab === 'list' && (
        <div className="space-y-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">总 Skills</div>
              <div className="text-2xl font-bold text-gray-900">{skills.length}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">活跃 Skills</div>
              <div className="text-2xl font-bold text-green-600">{skills.filter(s => s.enabled).length}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">僵尸 Skills</div>
              <div className="text-2xl font-bold text-red-600">{zombieSkills.length}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">重复 Skills</div>
              <div className="text-2xl font-bold text-orange-600">{duplicateSkills.length}</div>
            </div>
          </div>

          {/* 调用频率 Top 10 */}
          {callFrequencyData.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4">调用频率 Top 10</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={callFrequencyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Skills 列表 */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Skills 详情</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">调用次数</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最后使用</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">警告</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {skills.map((skill, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{skill.name}</div>
                        <div className="text-sm text-gray-500">{skill.description?.substring(0, 50)}...</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${skill.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {skill.enabled ? '启用' : '禁用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{skill.tokenCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{skill.callCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {skill.lastUsed ? new Date(skill.lastUsed).toLocaleDateString() : '从未'}
                      </td>
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
      )}

      {activeTab === 'analysis' && systemPrompt && (
        <div className="space-y-6">
          {/* SystemPrompt 概览 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4">Token 分布</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tokenDistributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value.toLocaleString()} tokens`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {tokenDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4">优化建议</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">当前 SystemPrompt</span>
                  <span className="text-lg font-bold text-gray-900">{systemPrompt.totalTokens.toLocaleString()} tokens</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">优化后 SystemPrompt</span>
                  <span className="text-lg font-bold text-green-600">{(systemPrompt.totalTokens - systemPrompt.savings).toLocaleString()} tokens</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="text-gray-600">可节省</span>
                  <span className="text-lg font-bold text-green-600">{systemPrompt.savings.toLocaleString()} tokens ({systemPrompt.savingsPercent}%)</span>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-medium mb-2">具体建议：</h3>
                <ul className="space-y-2">
                  {systemPrompt.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start">
                      <span className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-medium mr-2">
                        {index + 1}
                      </span>
                      <span className="text-gray-700">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 僵尸 Skills 列表 */}
          {zombieSkills.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4 text-red-600">僵尸 Skills（30 天未使用）</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Token</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">最后使用</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {zombieSkills.map((skill, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{skill.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{skill.tokenCount}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{skill.lastUsed ? new Date(skill.lastUsed).toLocaleDateString() : '从未'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 重复 Skills 列表 */}
          {duplicateSkills.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4 text-orange-600">重复 Skills</h2>
              <div className="space-y-4">
                {duplicateSkills.map((skill, index) => (
                  <div key={index} className="border border-orange-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{skill.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{skill.description}</p>
                      </div>
                      <span className="text-sm text-gray-500">{skill.tokenCount} tokens</span>
                    </div>
                    <div className="mt-3">
                      <span className="text-sm text-gray-600">与以下 skills 重复：</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {skill.duplicateWith?.map((dupe, i) => (
                          <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            {dupe}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
