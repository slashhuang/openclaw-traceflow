import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from 'recharts';

const BAR_PALETTE = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

function PreBlock({ text, emptyHint }) {
  const t = typeof text === 'string' ? text : '';
  if (!t.trim()) {
    return (
      <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
        {emptyHint ||
          '无正文（模板标记与当前版本不一致，或下方「原文」中查看完整 system 消息）。'}
      </div>
    );
  }
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[min(50vh,420px)] overflow-y-auto bg-white border border-gray-200 rounded p-3 text-gray-800 leading-relaxed">
      {t}
    </pre>
  );
}

export default function SystemPromptPage() {
  const [probe, setProbe] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllTools, setShowAllTools] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [probeRes, analysisRes, skillsRes] = await Promise.all([
          fetch('/api/skills/system-prompt/probe'),
          fetch('/api/skills/system-prompt/analysis'),
          fetch('/api/skills/usage'),
        ]);
        const [probeData, analysisData, skillsData] = await Promise.all([
          probeRes.json(),
          analysisRes.json(),
          skillsRes.json(),
        ]);
        if (!cancelled) {
          setProbe(probeData);
          setAnalysis(analysisData);
          setSkills(Array.isArray(skillsData) ? skillsData : []);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setProbe({ ok: false, error: String(e.message || e), breakdown: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const tokenDistribution = analysis
    ? [
        { name: '活跃 Skills', value: analysis.activeSkillsTokens, color: '#10B981' },
        { name: '僵尸 Skills', value: analysis.zombieSkillsTokens, color: '#EF4444' },
        { name: '重复 Skills', value: analysis.duplicateSkillsTokens, color: '#F59E0B' },
      ]
    : [];

  const zombieSkills = skills.filter(
    (s) => s.lastUsed && s.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000,
  );
  const duplicateSkills = skills.filter((s) => s.duplicateWith && s.duplicateWith.length > 0);
  const optimizedTotal = analysis ? analysis.totalTokens - analysis.savings : 0;

  const probeTotalTok =
    probe?.breakdown?.reduce((s, x) => s + (x.tokens || 0), 0) || 0;

  const breakdownItems = Array.isArray(probe?.breakdown) ? probe.breakdown : [];
  const workspaceFiles = Array.isArray(probe?.workspaceFiles) ? probe.workspaceFiles : [];
  const skillsDetail = Array.isArray(probe?.skillsDetail) ? probe.skillsDetail : [];
  const toolsDetail = Array.isArray(probe?.toolsDetail) ? probe.toolsDetail : [];
  const sections = probe?.sections || {
    fromTranscript: false,
    coreText: '',
    projectContextText: '',
    toolsListText: '',
    skillBlocks: [],
  };
  const workspaceFileContents = Array.isArray(probe?.workspaceFileContents)
    ? probe.workspaceFileContents
    : [];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Prompt</h1>
        <p className="text-gray-600 mt-1">
          Gateway 连接后通过 <code className="text-sm bg-gray-100 px-1 rounded">sessions.usage</code>{' '}
          嗅探 <strong>systemPromptReport</strong>（Skills / Tools / AGENTS.md 等字符占比）；正文优先从会话 transcript 的
          system 消息读取。
        </p>
      </div>

      {/* —— Gateway 嗅探 —— */}
      <div className="bg-white rounded-lg shadow mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-white">
          <h2 className="text-lg font-semibold text-indigo-900">Gateway 嗅探 · Token 构成</h2>
          <p className="text-sm text-gray-600 mt-1">
            约 Token = ⌈字符 / 4⌉，与 OpenClaw 内部估算一致；占比按字符数计算。
          </p>
        </div>
        <div className="p-6">
          {!probe?.ok && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm mb-4">
              <strong>嗅探未就绪：</strong> {probe?.error || '未知错误'}
            </div>
          )}

          {probe?.ok && (
            <>
              {!sections.fromTranscript && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm mb-4">
                  <strong>提示：</strong>
                  未从本机会话 transcript 读到足够长的 system 消息，下方「核心 / Project / Tools
                  列表 / Skills 块」正文可能为空。请确认监控能访问与 Gateway 相同的 state 目录，并让 Agent
                  至少成功跑过一轮；Workspace 文件仍会尝试从报告中的 workspace 路径读取。
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                {probe.sessionKey && (
                  <span>
                    <strong>会话</strong> <code className="bg-gray-100 px-1 rounded">{probe.sessionKey}</code>
                  </span>
                )}
                {probe.reportSource && (
                  <span>
                    <strong>报告</strong> {probe.reportSource}
                    {probe.reportGeneratedAt
                      ? ` · ${new Date(probe.reportGeneratedAt).toLocaleString('zh-CN')}`
                      : ''}
                  </span>
                )}
                {probe.model && (
                  <span>
                    <strong>模型</strong> {probe.model}
                  </span>
                )}
                {probe.workspaceDir && (
                  <span className="truncate max-w-md" title={probe.workspaceDir}>
                    <strong>Workspace</strong> {probe.workspaceDir}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">构成比例（横向直方图 · ~Token）</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      layout="vertical"
                      data={probe.breakdown}
                      margin={{ left: 8, right: 80, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={168}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <Tooltip
                        formatter={(v, _n, p) => [
                          `${v} tok（${p?.payload?.chars?.toLocaleString?.() ?? '?'} 字符）`,
                          '估算',
                        ]}
                      />
                      <Bar dataKey="tokens" radius={[0, 4, 4, 0]} name="~Token">
                        {probe.breakdown.map((_, i) => (
                          <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
                        ))}
                        <LabelList
                          dataKey="percent"
                          position="right"
                          formatter={(v) => `${v}%`}
                          style={{ fontSize: 11, fill: '#6b7280' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-500 mt-2">合计约 {probeTotalTok.toLocaleString()} tokens（六项之和）</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">System Prompt 区块明细（可展开）</h3>

                  <div className="space-y-3">
                    {breakdownItems.map((b) => {
                      const isWorkspace = b.id === 'workspace';
                      const isSkills = b.id === 'skills';

                      const skillsPreviewLimit = 30;
                      const toolsPreviewLimit = 30;

                      const skillsShown = showAllSkills ? skillsDetail : skillsDetail.slice(0, skillsPreviewLimit);
                      const toolsShown = showAllTools ? toolsDetail : toolsDetail.slice(0, toolsPreviewLimit);

                      const titleSuffix = `~${b.tokens} tok · ${b.percent}%`;

                      return (
                        <details key={b.id} className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                          <summary className="cursor-pointer font-medium text-gray-800 flex items-center justify-between">
                            <span>{b.label}</span>
                            <span className="text-xs text-gray-500 font-mono">{titleSuffix}</span>
                          </summary>
                          <div className="mt-3 text-sm space-y-3">
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                              <span>字符 {b.chars.toLocaleString()}</span>
                              <span>~Token {b.tokens.toLocaleString()}</span>
                              <span>占比 {b.percent}%</span>
                            </div>

                            {b.id === 'core' ? (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">正文（非 Project Context 段）</div>
                                <PreBlock text={sections.coreText} />
                              </div>
                            ) : null}

                            {b.id === 'project' ? (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">正文（# Project Context … ## Silent Replies 之间）</div>
                                <PreBlock text={sections.projectContextText} />
                              </div>
                            ) : null}

                            {isWorkspace ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-gray-600">注入文件正文（从 workspace 目录读取）</div>
                                {workspaceFileContents.length === 0 && workspaceFiles.length > 0 ? (
                                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                                    未能读取文件内容（workspace 路径不可用或与 Gateway 不一致）。
                                  </div>
                                ) : null}
                                {workspaceFileContents.map((wf, i) => (
                                  <details key={i} className="border border-gray-200 rounded-lg bg-white">
                                    <summary className="px-3 py-2 cursor-pointer text-sm font-medium flex justify-between gap-2">
                                      <span className="truncate" title={wf.path}>
                                        {wf.name || wf.path}
                                      </span>
                                      {wf.readError ? (
                                        <span className="text-red-600 text-xs shrink-0">{wf.readError}</span>
                                      ) : (
                                        <span className="text-gray-400 text-xs shrink-0">
                                          {wf.truncated ? '已截断展示' : `${(wf.content || '').length.toLocaleString()} 字符`}
                                        </span>
                                      )}
                                    </summary>
                                    <div className="px-3 pb-3">
                                      {wf.readError ? null : (
                                        <>
                                          {wf.truncated && (
                                            <p className="text-xs text-amber-700 mb-2">
                                              单文件展示上限约 40 万字符，已截断。
                                            </p>
                                          )}
                                          <PreBlock text={wf.content} emptyHint="空文件" />
                                        </>
                                      )}
                                    </div>
                                  </details>
                                ))}
                                <div className="max-h-40 overflow-y-auto border rounded-lg bg-gray-50">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-gray-100 sticky top-0">
                                      <tr>
                                        <th className="px-2 py-1 text-left">文件</th>
                                        <th className="px-2 py-1 text-right">注入字符</th>
                                        <th className="px-2 py-1 text-center">截断</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {workspaceFiles.map((f, j) => (
                                        <tr key={j} className="border-t border-gray-200">
                                          <td className="px-2 py-1 truncate max-w-[180px]">{f.name || f.path}</td>
                                          <td className="px-2 py-1 text-right font-mono">{(f.injectedChars ?? 0).toLocaleString()}</td>
                                          <td className="px-2 py-1 text-center">{f.truncated ? '是' : ''}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}

                            {isSkills ? (
                              <div className="space-y-2">
                                {sections.skillBlocks.length > 0 ? (
                                  <>
                                    <div className="text-xs font-medium text-gray-600">
                                      正文（&lt;skill&gt; … &lt;/skill&gt;，共 {sections.skillBlocks.length} 块）
                                    </div>
                                    {sections.skillBlocks.map((sk, i) => (
                                      <details key={i} className="border border-gray-200 rounded-lg bg-white">
                                        <summary className="px-3 py-2 cursor-pointer text-sm">
                                          <span className="font-mono">{sk.name}</span>
                                        </summary>
                                        <div className="px-3 pb-3">
                                          <PreBlock text={sk.content} />
                                        </div>
                                      </details>
                                    ))}
                                  </>
                                ) : (
                                  <>
                                    <div className="text-xs text-gray-500 mb-2">
                                      未在 system 正文中解析到 &lt;skill&gt; 块，以下为报告中的字符统计：
                                    </div>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="text-xs text-gray-500">
                                        {skillsShown.length}/{skillsDetail.length}
                                      </div>
                                      {skillsDetail.length > skillsPreviewLimit && (
                                        <button
                                          type="button"
                                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                          onClick={() => setShowAllSkills(!showAllSkills)}
                                        >
                                          {showAllSkills ? '收起' : '展开全部'}
                                        </button>
                                      )}
                                    </div>
                                    <div className="max-h-48 overflow-y-auto border rounded-lg bg-white">
                                      <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 sticky top-0">
                                          <tr>
                                            <th className="px-3 py-2 text-left">Skill</th>
                                            <th className="px-3 py-2 text-right">字符</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {skillsShown.map((s, i) => (
                                            <tr key={i} className="border-t">
                                              <td className="px-3 py-1.5">{s.name}</td>
                                              <td className="px-3 py-1.5 text-right font-mono">{s.blockChars.toLocaleString()}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : null}

                            {b.id === 'tools_list' ? (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">
                                  正文（system 里「工具名列表」段落）
                                </div>
                                <PreBlock text={sections.toolsListText} />
                              </div>
                            ) : null}

                            {b.id === 'tools_schema' ? (
                              <div className="space-y-2">
                                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                                  各工具的 JSON Schema <strong>不会</strong>出现在 system 消息文本里（只计入上下文体积）。
                                  下方为 Gateway 报告中的体积与参数数量统计。
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">
                                    {toolsShown.length}/{toolsDetail.length} 工具
                                  </span>
                                  {toolsDetail.length > toolsPreviewLimit && (
                                    <button
                                      type="button"
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                      onClick={() => setShowAllTools(!showAllTools)}
                                    >
                                      {showAllTools ? '收起' : '展开全部'}
                                    </button>
                                  )}
                                </div>
                                <div className="max-h-64 overflow-y-auto border rounded-lg bg-white">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0">
                                      <tr>
                                        <th className="px-3 py-2 text-left">Tool</th>
                                        <th className="px-3 py-2 text-right">Schema 字符</th>
                                        <th className="px-3 py-2 text-right">属性数</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {toolsShown.map((t, i) => (
                                        <tr key={i} className="border-t border-gray-100">
                                          <td className="px-3 py-2 font-mono">{t.name}</td>
                                          <td className="px-3 py-2 text-right font-mono">
                                            {(t.schemaChars ?? 0).toLocaleString()}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono">{t.propertiesCount ?? '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}

                            {!isWorkspace &&
                            !isSkills &&
                            b.id !== 'tools_list' &&
                            b.id !== 'tools_schema' &&
                            b.id !== 'core' &&
                            b.id !== 'project' &&
                            (b.chars || 0) === 0 ? (
                              <div className="text-xs text-gray-500">无数据</div>
                            ) : null}
                          </div>
                        </details>
                      );
                    })}

                    <details className="bg-white rounded-lg border border-gray-200 p-3">
                      <summary className="cursor-pointer font-medium text-gray-800 flex items-center justify-between">
                        <span>原文 Markdown（system messages）</span>
                        <span className="text-xs text-gray-500 font-mono">只读</span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="system-prompt-markdown border border-gray-200 rounded-lg p-4 max-h-[min(50vh,480px)] overflow-y-auto bg-gray-50/50" style={{ fontSize: '0.82rem' }}>
                          <ReactMarkdown>{probe.systemPromptMarkdown || '_（无内容）_'}</ReactMarkdown>
                        </div>
                        <details className="border border-gray-200 rounded-lg bg-white">
                          <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-800">
                            纯文本（完整 system，便于复制）
                          </summary>
                          <div className="px-3 pb-3">
                            <PreBlock text={probe.systemPromptMarkdown || ''} emptyHint="无内容" />
                          </div>
                        </details>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* —— 本地 Skills 目录分析（原有） —— */}
      {analysis && (
        <>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">本地 Skills 目录 · 优化分析</h2>
            <p className="text-gray-600 text-sm mt-1">基于 workspace 下 skills/ 与会话工具调用统计</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4">Token 分布（Skills 侧）</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tokenDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value.toLocaleString()}`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {tokenDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => value.toLocaleString()} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4">优化效果预估</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-gray-600">当前（Skills 合计）</span>
                  <span className="text-xl font-bold text-gray-900">
                    {analysis.totalTokens.toLocaleString()} tokens
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-gray-600">优化后预估</span>
                  <span className="text-xl font-bold text-green-600">
                    {optimizedTotal.toLocaleString()} tokens
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3">
                  <span className="text-gray-600">可节省</span>
                  <div className="text-right">
                    <span className="text-xl font-bold text-green-600">
                      {analysis.savings.toLocaleString()} tokens
                    </span>
                    <span className="ml-2 text-sm text-green-600">({analysis.savingsPercent}%)</span>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <h3 className="font-medium mb-3">建议</h3>
                <ul className="space-y-2">
                  {analysis.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start bg-gray-50 rounded p-3 text-sm">
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
        </>
      )}

      {!analysis && (
        <div className="text-center text-gray-500 py-8">本地 Skills 分析暂无数据</div>
      )}

      {zombieSkills.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b flex justify-between">
            <h2 className="text-lg font-semibold text-red-600">僵尸 Skills</h2>
            <span className="text-sm text-gray-500">共 {zombieSkills.length} 个</span>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="min-w-full text-sm">
              <tbody>
                {zombieSkills.slice(0, 15).map((skill, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2 font-medium">{skill.name}</td>
                    <td className="py-2 text-gray-500">{skill.tokenCount} tok</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {duplicateSkills.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <h2 className="text-lg font-semibold text-orange-600 mb-4">重复 Skills</h2>
          <div className="space-y-3 text-sm">
            {duplicateSkills.slice(0, 10).map((skill, index) => (
              <div key={index} className="border border-orange-100 rounded p-3">
                <strong>{skill.name}</strong>
                <span className="text-orange-600 ml-2">↔ {skill.duplicateWith?.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
